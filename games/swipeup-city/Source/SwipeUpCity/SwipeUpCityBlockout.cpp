#include "SwipeUpCityBlockout.h"

#include "Components/InstancedStaticMeshComponent.h"
#include "Components/SceneComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInterface.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/PackageName.h"
#include "UObject/SoftObjectPath.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
    constexpr float Grid = 2400.f; // 24 m between street centerlines
    constexpr float SeaLevel = -20.f;

    const TCHAR* LayerNames[] = {
        TEXT("Terrain"), TEXT("Road"), TEXT("Sidewalk"), TEXT("Beach"),
        TEXT("Sea"), TEXT("Lawn"), TEXT("Line"), TEXT("Concrete"),
        TEXT("Cream"), TEXT("Terracotta"), TEXT("BlueWall"), TEXT("Glass"),
        TEXT("Roof"), TEXT("Iron"), TEXT("Timber"), TEXT("Trunk"),
        TEXT("Leaf"), TEXT("PinkAccent"), TEXT("GoldAccent"), TEXT("Deck")
    };

    const bool NonBlocking[] = {
        false, false, false, false, true, false, true, false,
        false, false, false, true, false, true, true, false,
        true, true, true, false
    };

    UMaterialInterface* CityMaterial(const TCHAR* Name)
    {
        const FString Path = FString::Printf(
            TEXT("/Game/SwipeUpCity/Materials/MI_%s.MI_%s"), Name, Name);
        return LoadObject<UMaterialInterface>(nullptr, *Path);
    }
}

ASwipeUpCityBlockout::ASwipeUpCityBlockout()
{
    static_assert(UE_ARRAY_COUNT(LayerNames) == LayerCount);
    static_assert(UE_ARRAY_COUNT(NonBlocking) == LayerCount);
    PrimaryActorTick.bCanEverTick = false;
    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);

    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(
        TEXT("/Engine/BasicShapes/Cube.Cube"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cone(
        TEXT("/Engine/BasicShapes/Cone.Cone"));

    for (int32 Index = 0; Index < LayerCount; ++Index)
    {
        UInstancedStaticMeshComponent* Part =
            CreateDefaultSubobject<UInstancedStaticMeshComponent>(LayerNames[Index]);
        Part->SetupAttachment(Root);
        if (Cube.Succeeded()) Part->SetStaticMesh(Cube.Object);
        Part->SetCollisionProfileName(NonBlocking[Index] ? TEXT("NoCollision") : TEXT("BlockAll"));
        Part->SetCastShadow(Index != Sea && Index != Glass && Index != Line);
        MeshLayers.Add(Part);
    }

    PalmCanopies = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("PalmCanopies"));
    PalmCanopies->SetupAttachment(Root);
    if (Cone.Succeeded()) PalmCanopies->SetStaticMesh(Cone.Object);
    PalmCanopies->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void ASwipeUpCityBlockout::Box(int32 Layer, const FVector& Position,
                              const FVector& Size, float Yaw)
{
    if (!MeshLayers.IsValidIndex(Layer) || !MeshLayers[Layer]) return;
    const FVector MeshScale = Size / 100.f; // Engine cube measures 100 cm
    MeshLayers[Layer]->AddInstance(FTransform(FRotator(0, Yaw, 0), Position, MeshScale));
}

void ASwipeUpCityBlockout::Palm(float X, float Y, float Scale)
{
    if (AddImportedProp(TEXT("Palm"), FVector(X, Y, 10), FVector(440, 440, 640) * Scale)) return;
    const float Height = 540.f * Scale;
    Box(Trunk, FVector(X, Y, Height * 0.5f), FVector(65.f * Scale, 65.f * Scale, Height));
    // Cone crown, lighter than complex foliage; a licensed palm mesh can replace it.
    const FTransform CrownTransform(FRotator::ZeroRotator,
        FVector(X, Y, Height + 90.f * Scale),
        FVector(4.1f * Scale, 4.1f * Scale, 2.3f * Scale));
    PalmCanopies->AddInstance(CrownTransform);
}

void ASwipeUpCityBlockout::StreetLamp(float X, float Y, float Angle)
{
    if (AddImportedProp(TEXT("StreetLamp"), FVector(X, Y, 12), FVector(180, 75, 510), Angle)) return;
    const FRotator Rotation(0, Angle, 0);
    const FVector Base(X, Y, 0);
    Box(Iron, Base + FVector(0, 0, 260), FVector(27, 27, 510));
    Box(Iron, Base + Rotation.RotateVector(FVector(60, 0, 505)), FVector(140, 20, 22), Angle);
    Box(GoldAccent, Base + Rotation.RotateVector(FVector(112, 0, 488)), FVector(65, 45, 14), Angle);
}

void ASwipeUpCityBlockout::Bench(float X, float Y, float Angle)
{
    if (AddImportedProp(TEXT("Bench"), FVector(X, Y, 30), FVector(172, 70, 145), Angle)) return;
    const FRotator Rotation(0, Angle, 0);
    const FVector Base(X, Y, 0);
    Box(Timber, Base + FVector(0, 0, 65), FVector(170, 64, 16), Angle);
    Box(Timber, Base + Rotation.RotateVector(FVector(0, 27, 115)), FVector(170, 14, 105), Angle);
    Box(Iron, Base + Rotation.RotateVector(FVector(-70, 0, 30)), FVector(12, 12, 60), Angle);
    Box(Iron, Base + Rotation.RotateVector(FVector(70, 0, 30)), FVector(12, 12, 60), Angle);
}

void ASwipeUpCityBlockout::CafeTable(float X, float Y, bool Umbrella)
{
    Box(Iron, FVector(X, Y, 65), FVector(18, 18, 120));
    Box(Timber, FVector(X, Y, 130), FVector(126, 126, 15));
    for (int32 Side : {-1, 1})
    {
        Box(Timber, FVector(X + Side * 120.f, Y, 50), FVector(65, 65, 14));
        Box(Iron, FVector(X + Side * 120.f, Y, 24), FVector(12, 12, 48));
    }
    if (Umbrella)
    {
        Box(Iron, FVector(X, Y, 225), FVector(12, 12, 185));
        Box(PinkAccent, FVector(X, Y, 315), FVector(245, 245, 22));
    }
}

void ASwipeUpCityBlockout::Building(float X, float Y, int32 Floors, float Width,
                                     float Depth, int32 Style, FRandomStream& Random)
{
    const float Height = Floors * 305.f;
    const int32 Wall = Style == 0 ? Cream : Style == 1 ? Terracotta : BlueWall;
    const float Front = Y - Depth * 0.5f - 8.f;

    Box(Wall, FVector(X, Y, Height * 0.5f + 24.f), FVector(Width, Depth, Height));
    Box(Roof, FVector(X, Y, Height + 38.f), FVector(Width + 35.f, Depth + 35.f, 54.f));
    Box(Concrete, FVector(X, Front - 20.f, 33.f), FVector(Width + 100.f, 78.f, 50.f));

    // Ground-floor storefront. Glazing has no collision and is batched by material.
    Box(Glass, FVector(X, Front - 10.f, 180.f), FVector(Width - 100.f, 16.f, 220.f));
    Box(Iron, FVector(X, Front - 22.f, 292.f), FVector(Width - 65.f, 14.f, 14.f));
    Box(Style == 2 ? PinkAccent : GoldAccent, FVector(X, Front - 28.f, 342.f),
        FVector(Width * 0.62f, 24.f, 65.f));

    const int32 WindowsAcross = FMath::Clamp(FMath::FloorToInt(Width / 190.f), 2, 5);
    for (int32 Level = 1; Level < Floors; ++Level)
    {
        const float Z = Level * 305.f + 145.f;
        Box(Concrete, FVector(X, Front - 7.f, Level * 305.f + 16.f),
            FVector(Width + 10.f, 18.f, 18.f));
        for (int32 Col = 0; Col < WindowsAcross; ++Col)
        {
            const float Offset = (Col - (WindowsAcross - 1) * 0.5f) *
                ((Width - 110.f) / WindowsAcross);
            Box(Glass, FVector(X + Offset, Front - 13.f, Z),
                FVector(112.f, 15.f, 162.f));
            Box(Iron, FVector(X + Offset, Front - 26.f, Z - 87.f),
                FVector(121.f, 18.f, 11.f));
        }
    }

    // Alternating rooftop geometry helps avoid a repetitive skyline.
    if (Random.FRand() < 0.45f)
    {
        Box(Iron, FVector(X + Width * 0.28f, Y, Height + 95.f),
            FVector(82.f, 76.f, 80.f));
    }
    if (Style == 2 && Floors > 4)
    {
        Box(GoldAccent, FVector(X - Width * 0.42f, Front - 16.f,
            Height * 0.52f), FVector(22.f, 21.f, Height * 0.7f));
    }
}

void ASwipeUpCityBlockout::ParkSquare(float X, float Y, FRandomStream& Random)
{
    Box(Lawn, FVector(X, Y, 20.f), FVector(1730.f, 1730.f, 35.f));
    Box(Sidewalk, FVector(X, Y, 39.f), FVector(180.f, 1750.f, 18.f));
    Box(Sidewalk, FVector(X, Y, 40.f), FVector(1750.f, 180.f, 18.f));

    // Central stone fountain and shallow water.
    Box(Concrete, FVector(X, Y, 74.f), FVector(470.f, 470.f, 115.f));
    Box(Sea, FVector(X, Y, 135.f), FVector(380.f, 380.f, 10.f));
    Box(Iron, FVector(X, Y, 208.f), FVector(40.f, 40.f, 140.f));

    for (int32 I = 0; I < 8; ++I)
    {
        const float Theta = (2.f * PI * I) / 8.f;
        const float TX = X + FMath::Cos(Theta) * 660.f;
        const float TY = Y + FMath::Sin(Theta) * 660.f;
        Palm(TX, TY, Random.FRandRange(0.7f, 1.0f));
        if (I % 2 == 0) Bench(X + FMath::Cos(Theta) * 450.f,
                             Y + FMath::Sin(Theta) * 450.f, Theta * 180.f / PI);
    }
}

void ASwipeUpCityBlockout::LoadImportedProps()
{
    const FName Slots[] = {TEXT("Palm"), TEXT("StreetLamp"), TEXT("Bench"), TEXT("Car"), TEXT("Boat")};
    for (const FName Slot : Slots)
    {
        FString Path;
        if (!GConfig || !GConfig->GetString(TEXT("SwipeUpCity.ImportedMeshes"), *Slot.ToString(), Path, GGameIni))
            continue;

        const FSoftObjectPath MeshPath(Path);
        if (MeshPath.IsNull()) continue;
        UStaticMesh* Mesh = Cast<UStaticMesh>(MeshPath.ResolveObject());
        if (!Mesh && FPackageName::DoesPackageExist(MeshPath.GetLongPackageName()))
            Mesh = Cast<UStaticMesh>(MeshPath.TryLoad());
        if (!Mesh)
        {
            UE_LOG(LogTemp, Warning, TEXT("SwipeUp City: %s did not resolve to a static mesh: %s."),
                   *Slot.ToString(), *Path);
            continue;
        }

        UInstancedStaticMeshComponent* Layer = NewObject<UInstancedStaticMeshComponent>(this);
        Layer->SetupAttachment(GetRootComponent());
        Layer->SetStaticMesh(Mesh);
        Layer->SetCollisionProfileName(TEXT("NoCollision"));
        Layer->RegisterComponent();
        ImportedProps.Add(Slot, Layer);
    }
}

bool ASwipeUpCityBlockout::AddImportedProp(FName Name, const FVector& Origin,
                                           const FVector& Size, float Yaw)
{
    const TObjectPtr<UInstancedStaticMeshComponent>* Found = ImportedProps.Find(Name);
    if (!Found) return false;

    UInstancedStaticMeshComponent* Layer = Found->Get();
    const FBoxSphereBounds Bounds = Layer->GetStaticMesh()->GetBounds();
    const FVector FullSize = Bounds.BoxExtent * 2.f;
    if (FullSize.GetMin() <= UE_KINDA_SMALL_NUMBER) return false;

    const double Scale = (Size / FullSize).GetMin();
    const FRotator Rotation(0, Yaw, 0);
    const FVector Base(Bounds.Origin.X, Bounds.Origin.Y, Bounds.Origin.Z - Bounds.BoxExtent.Z);
    Layer->AddInstance(FTransform(Rotation, Origin - Rotation.RotateVector(Base * Scale), FVector(Scale)));
    return true;
}

void ASwipeUpCityBlockout::ParkingLot(float X, float Y)
{
    Box(Road, FVector(X, Y, 9), FVector(1660, 1650, 18));
    for (int32 Slot = -2; Slot <= 2; ++Slot)
    {
        const float BayX = X + Slot * 300.f;
        Box(Line, FVector(BayX - 148, Y + 420, 20), FVector(8, 525, 3));
        if (Slot % 2 != 0) continue;
        const FVector CarOrigin(BayX, Y + 420, 18);
        if (AddImportedProp(TEXT("Car"), CarOrigin, FVector(435, 185, 146), 90.f)) continue;
        const int32 Paint = Slot == 0 ? GoldAccent : PinkAccent;
        Box(Paint, CarOrigin + FVector(0, 0, 56), FVector(180, 420, 70));
        Box(Glass, CarOrigin + FVector(0, -20, 105), FVector(155, 222, 67));
        for (int32 Side : {-1, 1})
        {
            Box(Iron, CarOrigin + FVector(Side * 92, -123, 27), FVector(23, 62, 55));
            Box(Iron, CarOrigin + FVector(Side * 92, 123, 27), FVector(23, 62, 55));
        }
    }
    Box(Line, FVector(X + 752, Y + 420, 20), FVector(8, 525, 3));
    StreetLamp(X - 750, Y + 710);
    StreetLamp(X + 750, Y + 710, 180.f);
}

void ASwipeUpCityBlockout::CityBlock(int32 Col, int32 Row, FRandomStream& Random)
{
    const float X = (Col + 0.5f) * Grid;
    const float Y = (Row + 0.5f) * Grid;

    if ((Col == -1 || Col == 0) && Row >= -2 && Row <= 1
        && !(Col == -1 && Row == -1) && !(Col == 0 && Row == 0))
    {
        const float Side = Col < 0 ? -1.f : 1.f;
        Building(Side * 1800.f, Y, Row == -1 ? 3 : 4, 930.f, 1400.f,
                 Side < 0 ? 0 : 1, Random);
        CafeTable(Side * 1090.f, Y + 300.f, true);
        return;
    }

    // Harbor plaza, park and cafe square are intentionally navigable social spots.
    if (Col == 2 && Row == -2) { ParkingLot(X, Y); return; }
    if (Col == 0 && Row == 0) { ParkSquare(X, Y, Random); return; }
    if (Col == -1 && Row == -1)
    {
        Box(Sidewalk, FVector(X, Y, 18), FVector(1650, 1650, 36));
        for (int32 K = 0; K < 6; ++K)
            CafeTable(X - 450.f + (K % 3) * 430.f,
                      Y - 230.f + (K / 3) * 500.f, K % 2 == 0);
        for (int32 K = 0; K < 4; ++K)
            Palm(X - 650.f + K * 430.f, Y + 690.f, 0.75f);
        return;
    }
    if (Row == -3 && (Col == 0 || Col == 1))
    {
        Box(Sidewalk, FVector(X, Y, 23), FVector(1700, 1700, 30));
        for (int32 K = 0; K < 4; ++K)
            CafeTable(X - 500.f + K * 320.f, Y, true);
        Palm(X - 690.f, Y + 500.f, 0.9f);
        Palm(X + 690.f, Y + 500.f, 0.9f);
        return;
    }

    // Different districts: modern east, neighborhood north, active shopfronts south.
    const int32 Style = (Col >= 1) ? 2 : (Row >= 1 ? 0 : 1);
    const int32 F1 = (Style == 2)
        ? Random.RandRange(5, 8) : Random.RandRange(2, 5);
    const int32 F2 = Random.RandRange(2, Style == 2 ? 7 : 4);
    Building(X - 375.f, Y, F1, 740.f, 1120.f, Style, Random);
    Building(X + 400.f, Y, F2, 690.f, 1120.f, (Style + 1) % 3, Random);

    // Planters and seats soften the repetitive block grid.
    if (Random.FRand() > 0.35f) Bench(X, Y - 740.f, 0.f);
    if (Random.FRand() > 0.6f) Palm(X - 760.f, Y - 520.f, 0.75f);
}

void ASwipeUpCityBlockout::AddSunlight()
{
    if (!GetWorld() || GetNetMode() == NM_DedicatedServer) return;

    ADirectionalLight* Sun = GetWorld()->SpawnActor<ADirectionalLight>(
        ADirectionalLight::StaticClass(), FVector(0, 0, 5000),
        FRotator(-48.f, 38.f, 0.f));
    if (Sun && Sun->GetLightComponent())
    {
        Sun->GetLightComponent()->SetMobility(EComponentMobility::Movable);
        Sun->GetLightComponent()->SetIntensity(3.5f);
        Sun->GetLightComponent()->SetLightColor(FLinearColor(1.f, 0.88f, 0.72f));
    }
    ASkyLight* Sky = GetWorld()->SpawnActor<ASkyLight>();
    if (Sky && Sky->GetLightComponent())
    {
        Sky->GetLightComponent()->SetIntensity(0.75f);
    }
}

void ASwipeUpCityBlockout::BuildCity()
{
    FRandomStream Random(20261121);

    // Coastal terrain: beaches and water are decorative, not a swimming system.
    Box(Terrain, FVector(0, 650, -140), FVector(24000, 20700, 280));
    Box(Sea, FVector(0, -14500, SeaLevel), FVector(72000, 11800, 18));
    Box(Beach, FVector(0, -8900, -10), FVector(24000, 1650, 30));
    Box(Deck, FVector(0, -8080, 10), FVector(18000, 520, 38));

    // Seven longitudinal roads and seven cross streets.
    for (int32 Street = -3; Street <= 3; ++Street)
    {
        const float P = Street * Grid;
        Box(Road, FVector(P, 0, 2), FVector(690, 17400, 22));
        Box(Road, FVector(0, P, 2), FVector(17400, 690, 22));

        for (int32 Side : {-1, 1})
        {
            for (int32 Segment = -3; Segment < 3; ++Segment)
            {
                const float Center = (Segment + 0.5f) * Grid;
                Box(Sidewalk, FVector(P + Side * 440.f, Center, 15),
                    FVector(170, Grid - 690.f, 26));
                Box(Sidewalk, FVector(Center, P + Side * 440.f, 15),
                    FVector(Grid - 690.f, 170, 26));
            }
        }
        for (int32 Mark = -14; Mark <= 14; ++Mark)
        {
            if (Mark % 3 != 0) continue;
            Box(Line, FVector(P, Mark * 570.f, 16), FVector(13, 215, 3));
            Box(Line, FVector(Mark * 570.f, P, 16), FVector(215, 13, 3));
        }
    }

    // Crosswalks, stop marks, streetlights.
    for (int32 X = -3; X <= 3; ++X)
    {
        for (int32 Y = -3; Y <= 3; ++Y)
        {
            const float PX = X * Grid, PY = Y * Grid;
            if (FMath::Abs(X) < 3 && FMath::Abs(Y) < 3)
            {
                for (int32 S = -3; S <= 3; ++S)
                {
                    Box(Line, FVector(PX + S * 88.f, PY + 280.f, 15),
                        FVector(54, 100, 2));
                    Box(Line, FVector(PX + 280.f, PY + S * 88.f, 15),
                        FVector(100, 54, 2));
                }
            }
            if ((X + Y) % 2 == 0)
                StreetLamp(PX + 510.f, PY + 510.f);
        }
    }

    for (int32 Col = -3; Col < 3; ++Col)
        for (int32 Row = -3; Row < 3; ++Row)
            CityBlock(Col, Row, Random);

    // Colored paving separates the central pedestrian avenue from the streets.
    Box(Sidewalk, FVector(0, -100, 21), FVector(2340, 6800, 10));
    Box(Lawn, FVector(0, 0, 26), FVector(810, 6500, 3));
    for (int32 Stripe = -13; Stripe <= 13; ++Stripe)
        Box(Line, FVector(0, Stripe * 240.f, 29), FVector(760, 38, 2), 15.f);
    for (int32 Side : {-1, 1})
    {
        for (float Y : {-2930.f, -1820.f, -580.f, 480.f, 1590.f, 2780.f})
        {
            Palm(Side * 840.f, Y, 1.08f);
            StreetLamp(Side * 940.f, Y + 110.f, Side < 0 ? 0.f : 180.f);
            Bench(Side * 925.f, Y + 195.f, 90.f);
        }
    }

    // Sunset promenade and palm-lined beach.
    for (int32 N = -10; N <= 10; ++N)
    {
        const float X = N * 770.f;
        Palm(X, -7730.f, Random.FRandRange(0.83f, 1.12f));
        if (N % 3 == 0)
        {
            Bench(X + 220.f, -8060.f);
            StreetLamp(X, -7910.f);
        }
        if (N % 4 == 0) CafeTable(X + 190.f, -8460.f, true);
    }

    // Pier / marina foreground.
    Box(Deck, FVector(4500, -11100, 9), FVector(420, 5600, 34));
    for (int32 Pier = 0; Pier < 6; ++Pier)
    {
        const float Y = -9100.f - Pier * 700.f;
        Box(Iron, FVector(4300, Y, 100), FVector(22, 22, 190));
        Box(Iron, FVector(4700, Y, 100), FVector(22, 22, 190));
        // Decorative low-poly boat silhouette.
        if (!AddImportedProp(TEXT("Boat"), FVector(5400, Y, SeaLevel), FVector(650, 250, 210)))
        {
            Box(Cream, FVector(5400, Y, 35), FVector(650, 240, 100));
            Box(Glass, FVector(5400, Y, 115), FVector(260, 175, 90));
        }
    }

    // Distant skyline and hills, no expensive terrain shader.
    for (int32 K = -6; K <= 6; ++K)
    {
        const float X = K * 1650.f;
        Box(Lawn, FVector(X, 9250.f, 480.f + FMath::Abs(K % 3) * 160.f),
            FVector(1800.f, 1350.f, 920.f + FMath::Abs(K % 3) * 320.f));
    }
}

void ASwipeUpCityBlockout::BeginPlay()
{
    Super::BeginPlay();

    for (int32 Index = 0; Index < LayerCount; ++Index)
    {
        if (UMaterialInterface* Material = CityMaterial(LayerNames[Index == Deck ? Timber : Index]))
            MeshLayers[Index]->SetMaterial(0, Material);
    }
    if (UMaterialInterface* Leaves = CityMaterial(TEXT("Leaf")))
        PalmCanopies->SetMaterial(0, Leaves);

    LoadImportedProps();
    BuildCity();
    AddSunlight();
}
