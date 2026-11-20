#include "SwipeUpCityGameMode.h"
#include "SwipeUpCityCar.h"
#include "SwipeUpCityHarbor.h"
#include "SwipeUpCityPedestrian.h"
#include "SwipeUpCityCharacter.h"
#include "SwipeUpCityHUD.h"
#include "SwipeUpCityMobileController.h"
#include "Components/TextRenderComponent.h"
#include "Engine/TextRenderActor.h"
#include "Engine/World.h"
#include "TimerManager.h"

namespace
{
    const FVector Plaza(610, -6940, 121);
    const FRotator PlazaHeading(0, 90, 0);
    constexpr double StopRadius = 360;

    struct FTourStop
    {
        const TCHAR* Name;
        FVector Location;
    };

    const FTourStop Stops[] = {
        {TEXT("Mercan Parki"), FVector(4780, -1090, 15)},
        {TEXT("Sahil Kahvesi"), FVector(-4190, -6050, 15)},
        {TEXT("Liman Otoparki"), FVector(5080, -5500, 10)},
        {TEXT("Yelken Iskelesi"), FVector(4990, -10650, 35)}
    };
}

ASwipeUpCityGameMode::ASwipeUpCityGameMode()
{
    DefaultPawnClass = ASwipeUpCityCharacter::StaticClass();
    PlayerControllerClass = ASwipeUpCityMobileController::StaticClass();
    HUDClass = ASwipeUpCityHUD::StaticClass();
}

void ASwipeUpCityGameMode::StartPlay()
{
    UWorld* World = GetWorld();
    if (!World)
    {
        Super::StartPlay();
        return;
    }
    World->SpawnActor<ASwipeUpCityHarbor>();
    SpawnCityOccupants(*World);
    for (const FTourStop& Stop : Stops)
    {
        ATextRenderActor* Marker = World->SpawnActor<ATextRenderActor>(
            Stop.Location + FVector(0, 0, 240), FRotator::ZeroRotator);
        Markers.Add(Marker);
        if (Marker)
        {
            UTextRenderComponent* Label = Marker->GetTextRender();
            Label->SetText(FText::FromString(Stop.Name));
            Label->SetHorizontalAlignment(EHTA_Center);
            Label->SetWorldSize(58.f);
            Label->SetTextRenderColor(FColor(255, 193, 105));
        }
    }

    Super::StartPlay();
    GetWorldTimerManager().SetTimer(TourTimer, this, &ASwipeUpCityGameMode::UpdateTour, 0.1f, true);
}

void ASwipeUpCityGameMode::RestartPlayer(AController* NewPlayer)
{
    if (NewPlayer)
    {
        RestartPlayerAtTransform(NewPlayer, FTransform(PlazaHeading, Plaza));
    }
}

int32 ASwipeUpCityGameMode::GetVisitedCount() const
{
    int32 Count = 0;
    for (int32 Index = 0; Index < GetStopCount(); ++Index)
        Count += (VisitedStops & (1 << Index)) != 0;
    return Count;
}

int32 ASwipeUpCityGameMode::GetStopCount() const
{
    return UE_ARRAY_COUNT(Stops);
}

FString ASwipeUpCityGameMode::GetClosestStop(const FVector& From) const
{
    const FTourStop* Closest = nullptr;
    double Distance = TNumericLimits<double>::Max();
    for (int32 Index = 0; Index < GetStopCount(); ++Index)
    {
        if (VisitedStops & (1 << Index)) continue;
        const double Candidate = FVector::Dist2D(From, Stops[Index].Location);
        if (Candidate < Distance)
        {
            Distance = Candidate;
            Closest = &Stops[Index];
        }
    }

    if (!Closest) return TEXT("Tur tamamlandi. Sehir seni bekliyor.");

    const FVector Offset = Closest->Location - From;
    const double Degrees = FMath::RadiansToDegrees(FMath::Atan2(Offset.X, Offset.Y));
    const TCHAR* Directions[] = {TEXT("K"), TEXT("KD"), TEXT("D"), TEXT("GD"),
        TEXT("G"), TEXT("GB"), TEXT("B"), TEXT("KB")};
    const int32 Direction = (FMath::RoundToInt(Degrees / 45.0) + 8) % 8;
    return FString::Printf(TEXT("%s  |  %d m  %s"), Closest->Name,
        FMath::RoundToInt(Distance / 100.0), Directions[Direction]);
}

void ASwipeUpCityGameMode::SpawnCityOccupants(UWorld& World) const
{
    const auto SpawnCar = [&World](const FVector& Point, float Yaw, int32 Style)
    {
        const FTransform Transform(FRotator(0, Yaw, 0), Point);
        if (ASwipeUpCityCar* Car = World.SpawnActorDeferred<ASwipeUpCityCar>(
            ASwipeUpCityCar::StaticClass(), Transform, nullptr, nullptr,
            ESpawnActorCollisionHandlingMethod::AlwaysSpawn))
        {
            Car->SetPaintStyle(Style);
            Car->FinishSpawning(Transform);
        }
    };
    SpawnCar(FVector(-500, -3190, 68), 0.f, 0);
    SpawnCar(FVector(1100, -3610, 68), 180.f, 1);
    SpawnCar(FVector(4920, -5030, 68), 90.f, 2);
    SpawnCar(FVector(-4900, -3310, 68), 0.f, 3);

    const TArray<FVector> PedestrianLoops[] = {
        { FVector(1700,-7710,18), FVector(2150,-7340,18), FVector(1920,-5420,18), FVector(1880,-5130,18) },
        { FVector(-1850,-7470,18), FVector(-2040,-5730,18), FVector(-1400,-5230,18), FVector(-920,-6830,18) },
        { FVector(-5290,-6830,15), FVector(-3550,-6840,15), FVector(-3550,-4750,15), FVector(-5400,-4770,15) },
        { FVector(4785,-1720,15), FVector(4790,-825,15), FVector(5290,-800,15), FVector(5500,-1790,15) },
        { FVector(4700,-8280,10), FVector(5000,-8870,33), FVector(5030,-10150,34), FVector(4880,-8830,33) }
    };
    for (int32 Route = 0; Route < UE_ARRAY_COUNT(PedestrianLoops); ++Route)
    {
        const TArray<FVector>& Points = PedestrianLoops[Route];
        for (int32 Person = 0; Person < (Route < 2 ? 3 : 2); ++Person)
        {
            if (ASwipeUpCityPedestrian* Actor = World.SpawnActor<ASwipeUpCityPedestrian>())
                Actor->Configure(Points, 135.f + ((Route * 17 + Person * 9) % 47),
                                 Person, .91f + ((Person + Route) % 4) * .043f, (Person + Route) % 4);
        }
    }
}

void ASwipeUpCityGameMode::ReturnToPlaza(APlayerController* Player) const
{
    if (ASwipeUpCityMobileController* Controller = Cast<ASwipeUpCityMobileController>(Player))
        Controller->RecoverTo(Plaza, PlazaHeading);
}

void ASwipeUpCityGameMode::RestartTour()
{
    VisitedStops = 0;
    for (ATextRenderActor* Marker : Markers)
    {
        if (Marker)
            Marker->GetTextRender()->SetTextRenderColor(FColor(255, 193, 105));
    }
    if (APlayerController* Player = GetWorld()->GetFirstPlayerController())
        ReturnToPlaza(Player);
}

void ASwipeUpCityGameMode::UpdateTour()
{
    APlayerController* Player = GetWorld()->GetFirstPlayerController();
    APawn* Pawn = Player ? Player->GetPawn() : nullptr;
    if (!Pawn) return;
    const FVector Position = Pawn->GetActorLocation();
    const bool bCarInWater = Pawn->IsA<ASwipeUpCityCar>() && Position.Y < -9450.f;
    if (Position.Z < -150.f || FMath::Abs(Position.X) > 14150.f ||
        Position.Y > 11200.f || Position.Y < -13550.f || bCarInWater)
    {
        ReturnToPlaza(Player);
        return;
    }

    for (int32 Index = 0; Index < GetStopCount(); ++Index)
    {
        if (ATextRenderActor* Marker = Markers[Index])
        {
            const FVector ToPlayer = Position - Marker->GetActorLocation();
            Marker->SetActorRotation(FRotator(0, ToPlayer.Rotation().Yaw, 0));
        }
        if (!(VisitedStops & (1 << Index))
            && FMath::Abs(Position.Z - Stops[Index].Location.Z) < 300.f
            && FVector::DistSquared2D(Position, Stops[Index].Location) < FMath::Square(StopRadius))
        {
            VisitedStops |= 1 << Index;
            if (ATextRenderActor* Marker = Markers[Index])
                Marker->GetTextRender()->SetTextRenderColor(FColor(112, 235, 164));
        }
    }
}
