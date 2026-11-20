#include "SwipeUpCityLife.h"
#include "SwipeUpCityCar.h"
#include "SwipeUpCityLifeSave.h"
#include "SwipeUpCityMesh.h"
#include "Components/SceneComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/TextRenderActor.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "Kismet/GameplayStatics.h"
#include "ProceduralMeshComponent.h"

using namespace SwipeUpCityLife;

namespace
{
    struct Station
    {
        const TCHAR* Name;
        FVector Location;
        double Radius;
    };
    const Station Stations[] = {
        { TEXT(""), FVector::ZeroVector, 0 },
        { TEXT("Mercan Kafe"), FVector(-4010,-6280,16), 345 },
        { TEXT("Paket Merkezi"), FVector(-6420,-5310,15), 405 },
        { TEXT("Taksi Durağı"), FVector(3130,-3490,12), 420 },
        { TEXT("Mercan Parkı"), FVector(4780,-1090,15), 425 },
        { TEXT("Yelken İskelesi"), FVector(4990,-10650,35), 400 },
        { TEXT("Sahil Sahnesi"), FVector(650,-4780,18), 480 },
        { TEXT("Sahil Kulübü"), FVector(-2100,-7620,18), 405 },
        { TEXT("Liman Garajı"), FVector(5950,-5570,12), 395 },
        { TEXT("Fener Terası"), FVector(6740,-8010,18), 415 },
    };
    static_assert(UE_ARRAY_COUNT(Stations) == static_cast<int32>(Place::Count));
    const TCHAR* Cars[] = {TEXT("Minik Hatchback"), TEXT("Panelvan"), TEXT("Açık Tavan"),
        TEXT("Arazi SUV"), TEXT("Pickup"), TEXT("Sahil Coupé")};
    static_assert(UE_ARRAY_COUNT(Cars) == Vehicles.size());
    constexpr double OrderDelay = 8.;
    constexpr double DanceInterval = 1.13;
    constexpr double DanceWindow = .28;
    constexpr int DanceBeats = 4;
    constexpr double YogaTime = 12.;
    constexpr double RunTime = 42.;
    constexpr Place RaceRoute[] = {Place::Stage, Place::Overlook, Place::Marina};

    FString SlotName(int64 Sequence)
    {
        return FString::Printf(TEXT("MercanLife%d"), static_cast<int32>(Sequence & 1));
    }

    const TCHAR* StepName(Job Active, int32 Stage)
    {
        switch (Active)
        {
        case Job::Barista: return Stage == 0 ? TEXT("Kahveyi hazırla") : TEXT("Kahveyi teslim et");
        case Job::Courier: return Stage == 0 ? TEXT("Paketi teslim al") : TEXT("Paketi teslim et");
        case Job::Taxi: return Stage == 0 ? TEXT("İlk yolcuyu al") : Stage == 1 ? TEXT("Parktan ikinci yolcuyu al") : TEXT("Yolcuları indir");
        case Job::Photographer: return Stage < 2 ? TEXT("Fotoğrafı çek") : TEXT("Albümü teslim et");
        default: return TEXT("");
        }
    }
}

ASwipeUpCityLife::ASwipeUpCityLife()
{
    SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("LifeOrigin")));
}

void ASwipeUpCityLife::BeginPlay()
{
    Super::BeginPlay();
    LoadProfile();
    CafeOrderAt = GetWorld()->GetTimeSeconds() + OrderDelay;
    if (GetNetMode() == NM_DedicatedServer) return;

    Decor2 = SwipeUpCityMesh::Add(*this, *GetRootComponent(), TEXT("CafeDecor2"));
    Decor3 = SwipeUpCityMesh::Add(*this, *GetRootComponent(), TEXT("CafeDecor3"));
    UpdateCafeDecor();
    for (const FVector& Point : { FVector(-4290, -5816, 273), FVector(-3820, -5816, 273) })
    {
        UPointLightComponent* Lighting = NewObject<UPointLightComponent>(this);
        Lighting->SetupAttachment(GetRootComponent());
        Lighting->SetRelativeLocation(Point);
        Lighting->SetLightColor(FLinearColor(1.f, .69f, .43f));
        Lighting->SetIntensity(1060.f);
        Lighting->SetAttenuationRadius(530.f);
        Lighting->SetCastShadows(false);
        AddInstanceComponent(Lighting);
        Lighting->RegisterComponent();
    }

    for (int32 Index = 1; Index < UE_ARRAY_COUNT(Stations); ++Index)
    {
        const Station& Site = Stations[Index];
        ATextRenderActor* Sign = GetWorld()->SpawnActor<ATextRenderActor>(
            Site.Location + FVector(0, 0, 242), FRotator::ZeroRotator);
        Signs.Add(Sign);
        if (!Sign) continue;
        Sign->GetTextRender()->SetText(FText::FromString(Site.Name));
        Sign->GetTextRender()->SetHorizontalAlignment(EHTA_Center);
        Sign->GetTextRender()->SetWorldSize(34.f);
        Sign->GetTextRender()->SetTextRenderColor(FColor(116, 225, 201));
        Sign->SetActorHiddenInGame(true);
    }
}

void ASwipeUpCityLife::LoadProfile()
{
    for (int32 Slot : {0, 1})
    {
        const auto* Save = Cast<USwipeUpCityLifeSave>(UGameplayStatics::LoadGameFromSlot(SlotName(Slot), 0));
        if (!Save || Save->Revision <= Revision || Save->Revision >= TNumericLimits<int64>::Max() - 1 || Save->Data.Num() != static_cast<int32>(SwipeUpCityLife::Profile::Fields{}.size()))
            continue;
        SwipeUpCityLife::Profile::Fields Fields{};
        for (int32 I = 0; I < Save->Data.Num(); ++I)
            Fields[I] = Save->Data[I];
        SwipeUpCityLife::Profile Candidate;
        if (SwipeUpCityLife::Profile::Read(Fields, Candidate))
        {
            Profile = Candidate;
            Revision = Save->Revision;
        }
    }
}

bool ASwipeUpCityLife::Commit(const SwipeUpCityLife::Profile& NewProfile)
{
    USwipeUpCityLifeSave* Save = NewObject<USwipeUpCityLifeSave>(this);
    Save->Revision = Revision + 1;
    for (int Value : NewProfile.Write())
        Save->Data.Add(Value);
    if (!UGameplayStatics::SaveGameToSlot(Save, SlotName(Save->Revision), 0))
    {
        SetNotice(TEXT("Kayıt yazılamadı. İşlem uygulanmadı."));
        return false;
    }
    Profile = NewProfile;
    Revision = Save->Revision;
    UpdateCafeDecor();
    return true;
}

void ASwipeUpCityLife::UpdateCafeDecor()
{
    if (Decor2) Decor2->SetVisibility(Profile.CafeLevel >= 2);
    if (Decor3) Decor3->SetVisibility(Profile.CafeLevel >= 3);
}

void ASwipeUpCityLife::SetNotice(FString InNotice)
{
    Notice = MoveTemp(InNotice);
    NoticeUntil = GetWorld()->GetTimeSeconds() + 5.;
}

bool ASwipeUpCityLife::Report(Result Change)
{
    switch (Change)
    {
    case Result::Ok: return true;
    case Result::TooPoor: SetNotice(TEXT("Bu işlem için paran yetmiyor.")); break;
    case Result::Locked: SetNotice(TEXT("Bu işlem henüz açık değil.")); break;
    case Result::Busy: SetNotice(TEXT("Önce mevcut vardiyayı bitir veya bırak.")); break;
    case Result::Full: SetNotice(TEXT("Bu seçenek zaten tamamlandı.")); break;
    case Result::Empty: SetNotice(TEXT("Önce malzeme al.")); break;
    case Result::Closed: SetNotice(TEXT("Önce kafeyi aç.")); break;
    case Result::WrongPlace: SetNotice(TEXT("Görev konumuna yaklaş.")); break;
    case Result::NeedCar: SetNotice(TEXT("Bu adım için otomobille gel.")); break;
    case Result::NeedFoot: SetNotice(TEXT("Bu adım için araçtan in.")); break;
    }
    return false;
}

const TCHAR* ASwipeUpCityLife::PlaceName(Place Site)
{
    return Stations[static_cast<int32>(Site)].Name;
}

const TCHAR* ASwipeUpCityLife::CarName(int32 Index)
{
    return Cars[FMath::Clamp(Index, 0, static_cast<int32>(Vehicles.size()) - 1)];
}

Place ASwipeUpCityLife::FindPlace(const APawn& Pawn) const
{
    const FVector Position = Pawn.GetActorLocation();
    Place Best = Place::None;
    double Distance = TNumericLimits<double>::Max();
    for (int32 Index = 1; Index < UE_ARRAY_COUNT(Stations); ++Index)
    {
        const Station& Site = Stations[Index];
        const double Dist = FVector::DistSquared2D(Position, Site.Location);
        if (Dist < Distance && Dist < Site.Radius * Site.Radius &&
            FMath::Abs(Position.Z - Site.Location.Z) < 230)
        {
            Best = static_cast<Place>(Index);
            Distance = Dist;
        }
    }
    return Best;
}

TArray<FCityLifeChoice> ASwipeUpCityLife::Choices(const APawn& Pawn) const
{
    TArray<FCityLifeChoice> Items;
    const Place At = FindPlace(Pawn);
    if (At == Place::None) return Items;

    const auto Add = [&Items](ECityLifeAction Action, FString Label)
    {
        Items.Add({Action, MoveTemp(Label)});
    };
    if (Profile.Active != Job::None)
    {
        const Step Target = GetShift(Profile.Active).Steps[Profile.Stage];
        if (At == Target.Site) Add(ECityLifeAction::Work, StepName(Profile.Active, Profile.Stage));
        if (At == GetShift(Profile.Active).Employer) Add(ECityLifeAction::EndShift, TEXT("Vardiyayı bırak"));
    }

    if (const auto* Car = Cast<ASwipeUpCityCar>(&Pawn))
    {
        if (Car->GetSpeedKmh() > 4.f || Profile.Active != Job::Taxi) Items.Reset();
        return Items;
    }

    switch (At)
    {
    case Place::Cafe:
        if (Profile.CafeLevel == 0)
            Add(ECityLifeAction::BuyCafe, FString::Printf(TEXT("Kafeyi satın al  •  %d kredi"), SwipeUpCityLife::Profile::TilePrice));
        else
        {
            if (Profile.bCafeOpen)
            {
                const bool bReady = GetWorld()->GetTimeSeconds() >= CafeOrderAt;
                Add(ECityLifeAction::Serve, bReady ? TEXT("Müşteriye kahve servis et") : TEXT("Sipariş bekleniyor"));
            }
            Add(ECityLifeAction::ToggleCafe, Profile.bCafeOpen ? TEXT("Kafeyi kapat") : TEXT("Kafeyi aç"));
            if (Profile.Supplies < Profile.Capacity())
            {
                const int32 Count = FMath::Min(5, Profile.Capacity() - Profile.Supplies);
                Add(ECityLifeAction::Restock, FString::Printf(TEXT("%d malzeme al  •  %d kredi"), Count, Count * 15));
            }
            if (Profile.CafeLevel < 3)
                Add(ECityLifeAction::UpgradeCafe, FString::Printf(TEXT("Kafeyi yükselt  •  %d kredi"), Profile.UpgradePrice()));
        }
        if (Profile.Active == Job::None)
            Add(ECityLifeAction::StartBarista, TEXT("Barista vardiyası  •  165 kredi"));
        break;
    case Place::Courier:
        if (Profile.Active == Job::None) Add(ECityLifeAction::StartCourier, TEXT("Kurye vardiyası  •  190 kredi"));
        break;
    case Place::Taxi:
        if (Profile.Active == Job::None) Add(ECityLifeAction::StartTaxi, TEXT("Taksici vardiyası  •  265 kredi"));
        break;
    case Place::Overlook:
        if (Profile.Active == Job::None) Add(ECityLifeAction::StartPhotographer, TEXT("Fotoğrafçı vardiyası  •  230 kredi"));
        break;
    case Place::Stage: Add(ECityLifeAction::Dance, TEXT("Ritim dansına katıl")); break;
    case Place::Training:
        Add(ECityLifeAction::Yoga, TEXT("Kıyı yogasına katıl"));
        Add(ECityLifeAction::Run, TEXT("Sahil koşusuna katıl"));
        break;
    case Place::Garage:
        for (int32 I = 0; I < UE_ARRAY_COUNT(Cars); ++I)
        {
            const FString Details = Profile.OwnsCar(I) ? TEXT("Sende") :
                FString::Printf(TEXT("%d kredi"), Vehicles[I].Price);
            Add(static_cast<ECityLifeAction>(static_cast<int32>(ECityLifeAction::Car0) + I),
                FString::Printf(TEXT("%s  •  %s"), Cars[I], *Details));
        }
        break;
    default: break;
    }
    return Items;
}

bool ASwipeUpCityLife::Select(ECityLifeAction Action, APawn& Pawn)
{
    const TArray<FCityLifeChoice> Current = Choices(Pawn);
    if (!Current.ContainsByPredicate([Action](const FCityLifeChoice& Choice) { return Choice.Action == Action; }))
        return false;

    auto Next = Profile;
    Result Change = Result::Ok;
    FString Feedback;
    int32 Paid = 0;
    const Place At = FindPlace(Pawn);
    switch (Action)
    {
    case ECityLifeAction::BuyCafe: Change = Next.BuyCafe(); Feedback = TEXT("Mercan Kafe artık senin."); break;
    case ECityLifeAction::ToggleCafe: Change = Next.ToggleCafe(); Feedback = Next.bCafeOpen ?
        TEXT("Kafe açıldı. İlk sipariş birazdan hazır.") : TEXT("Kafe kapandı."); break;
    case ECityLifeAction::Restock: Change = Next.Refill(); Feedback = TEXT("Kafe malzemeleri yenilendi."); break;
    case ECityLifeAction::UpgradeCafe: Change = Next.UpgradeCafe(); Feedback = TEXT("Kafeye yeni dekor ve daha geniş stok alanı eklendi."); break;
    case ECityLifeAction::Serve:
        if (GetWorld()->GetTimeSeconds() < CafeOrderAt)
        {
            SetNotice(TEXT("Yeni müşteri siparişi hazırlanıyor."));
            return false;
        }
        Change = Next.Serve();
        Feedback = FString::Printf(TEXT("Kahve servis edildi. +%d kredi"), Next.CupPrice());
        break;
    case ECityLifeAction::StartBarista: Change = Next.TakeShift(Job::Barista, At); break;
    case ECityLifeAction::StartCourier: Change = Next.TakeShift(Job::Courier, At); break;
    case ECityLifeAction::StartTaxi: Change = Next.TakeShift(Job::Taxi, At); break;
    case ECityLifeAction::StartPhotographer: Change = Next.TakeShift(Job::Photographer, At); break;
    case ECityLifeAction::Work:
        Change = Next.Work(At, Pawn.IsA<ASwipeUpCityCar>(), Paid);
        if (Paid) Feedback = FString::Printf(TEXT("Vardiya bitti. +%d kredi"), Paid);
        break;
    case ECityLifeAction::EndShift: Next.QuitShift(); Feedback = TEXT("Vardiya bırakıldı."); break;
    case ECityLifeAction::Dance: return StartActivity(Activity::Dance);
    case ECityLifeAction::Yoga: return StartActivity(Activity::Yoga);
    case ECityLifeAction::Run: return StartActivity(Activity::Run);
    default:
    {
        const int32 Index = static_cast<int32>(Action) - static_cast<int32>(ECityLifeAction::Car0);
        Change = Next.BuyCar(Index);
        Feedback = FString::Printf(TEXT("%s anahtarları alındı."), CarName(Index));
        break;
    }
    }
    if (!Report(Change) || !Commit(Next)) return false;
    if (Action == ECityLifeAction::Serve || Action == ECityLifeAction::ToggleCafe)
        CafeOrderAt = GetWorld()->GetTimeSeconds() + OrderDelay;
    SetNotice(Feedback.IsEmpty() ? TEXT("Görev güncellendi.") : MoveTemp(Feedback));
    return true;
}

bool ASwipeUpCityLife::StartActivity(Activity Kind)
{
    if (Playing != Activity::None)
    {
        SetNotice(TEXT("Bir etkinlik zaten devam ediyor."));
        return false;
    }
    const double Now = GetWorld()->GetTimeSeconds();
    if (Now - LastActivity < 12.)
    {
        SetNotice(TEXT("Bir sonraki grup birazdan başlıyor."));
        return false;
    }
    Playing = Kind;
    ActivityStart = Now;
    Progress = 0;
    return true;
}

bool ASwipeUpCityLife::DanceBeat(const APawn& Pawn)
{
    if (Playing != Activity::Dance) return false;
    if (FindPlace(Pawn) != Place::Stage || Pawn.IsA<ASwipeUpCityCar>())
    {
        CancelActivity();
        return false;
    }
    const double Elapsed = GetWorld()->GetTimeSeconds() - ActivityStart;
    const double Beat = (Progress + 1) * DanceInterval;
    if (FMath::Abs(Elapsed - Beat) <= DanceWindow)
    {
        if (++Progress == DanceBeats) FinishActivity(85);
    }
    return true;
}

bool ASwipeUpCityLife::IsDancing() const
{
    return Playing == Activity::Dance;
}

bool ASwipeUpCityLife::IsStretching() const
{
    return Playing == Activity::Yoga || Playing == Activity::Dance;
}

void ASwipeUpCityLife::FinishActivity(int32 Reward)
{
    auto Next = Profile;
    Next.CompleteActivity(Reward);
    LastActivity = GetWorld()->GetTimeSeconds();
    CancelActivity();
    if (Commit(Next))
        SetNotice(FString::Printf(TEXT("Etkinlik tamamlandı. +%d kredi ve 1 sosyal puan."), Reward));
}

void ASwipeUpCityLife::CancelActivity()
{
    Playing = Activity::None;
    Progress = 0;
}

void ASwipeUpCityLife::UpdateActivity(APawn& Pawn)
{
    if (Playing == Activity::None) return;

    const double Now = GetWorld()->GetTimeSeconds();
    const double Elapsed = Now - ActivityStart;
    const Place At = FindPlace(Pawn);
    if (Pawn.IsA<ASwipeUpCityCar>() || (Playing == Activity::Yoga && At != Place::Training) ||
        (Playing == Activity::Dance && At != Place::Stage))
    {
        CancelActivity();
        SetNotice(TEXT("Etkinlik alanından ayrıldın."));
        return;
    }

    switch (Playing)
    {
    case Activity::Dance:
        if (Elapsed > (Progress + 1) * DanceInterval + DanceWindow)
        {
            CancelActivity();
            SetNotice(TEXT("Ritmi kaçırdın. Yeniden katılabilirsin."));
        }
        break;
    case Activity::Yoga:
        if (Pawn.GetVelocity().SizeSquared() > FMath::Square(65.)) ActivityStart = Now;
        else if (Elapsed >= YogaTime) FinishActivity(65);
        break;
    case Activity::Run:
        if (Elapsed >= RunTime)
        {
            CancelActivity();
            SetNotice(TEXT("Koşu süresi doldu."));
        }
        else if (At == RaceRoute[Progress] && ++Progress == UE_ARRAY_COUNT(RaceRoute))
            FinishActivity(115);
        break;
    default: break;
    }
}

void ASwipeUpCityLife::UpdatePlayer(APawn& Pawn)
{
    if (GetWorld()->GetTimeSeconds() >= NoticeUntil) Notice.Reset();
    UpdateActivity(Pawn);
    for (int32 I = 0; I < Signs.Num(); ++I)
    {
        ATextRenderActor* Sign = Signs[I];
        if (!Sign) continue;
        const FVector View = Pawn.GetActorLocation() - Sign->GetActorLocation();
        const bool bNear = View.SizeSquared2D() < FMath::Square(2650.);
        Sign->SetActorHiddenInGame(!bNear);
        if (bNear) Sign->SetActorRotation(FRotator(0, View.Rotation().Yaw, 0));
    }
}

FString ASwipeUpCityLife::CurrentTask(const APawn& Pawn) const
{
    const double Elapsed = GetWorld()->GetTimeSeconds() - ActivityStart;
    if (Playing == Activity::Dance)
    {
        const double Beat = (Progress + 1) * DanceInterval;
        return FMath::Abs(Beat - Elapsed) <= DanceWindow ?
            FString::Printf(TEXT("ŞİMDİ BAS!   %d / %d"), Progress, DanceBeats) :
            FString::Printf(TEXT("Ritme %.1f sn   %d / %d"), FMath::Max(0., Beat - Elapsed), Progress, DanceBeats);
    }
    if (Playing == Activity::Yoga)
        return FString::Printf(TEXT("Sabit dur, nefeslen   %.0f sn"), FMath::Max(0., YogaTime - Elapsed));
    const auto RouteText = [&Pawn](Place Destination)
    {
        const FVector Offset = Stations[static_cast<int32>(Destination)].Location - Pawn.GetActorLocation();
        const double Degrees = FMath::RadiansToDegrees(FMath::Atan2(Offset.X, Offset.Y));
        const TCHAR* Directions[] = {TEXT("K"), TEXT("KD"), TEXT("D"), TEXT("GD"),
            TEXT("G"), TEXT("GB"), TEXT("B"), TEXT("KB")};
        const int32 Direction = (FMath::RoundToInt(Degrees / 45.0) + 8) % 8;
        return FString::Printf(TEXT("%s • %d m %s"), PlaceName(Destination),
            FMath::RoundToInt(Offset.Size2D() / 100.), Directions[Direction]);
    };
    if (Playing == Activity::Run)
        return FString::Printf(TEXT("Koşu %d/3 • %s • %.0f sn"), Progress, *RouteText(RaceRoute[Progress]),
            FMath::Max(0., RunTime - Elapsed));
    if (Profile.Active != Job::None)
    {
        const Shift& Assignment = GetShift(Profile.Active);
        const Step Target = Assignment.Steps[Profile.Stage];
        return FString::Printf(TEXT("%s • %s"), StepName(Profile.Active, Profile.Stage), *RouteText(Target.Site));
    }
    return {};
}
