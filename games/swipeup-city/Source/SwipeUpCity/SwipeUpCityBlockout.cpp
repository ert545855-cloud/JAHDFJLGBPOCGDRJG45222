#include "SwipeUpCityBlockout.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/SceneComponent.h"
#include "Engine/StaticMesh.h"
#include "UObject/ConstructorHelpers.h"

ASwipeUpCityBlockout::ASwipeUpCityBlockout()
{
    PrimaryActorTick.bCanEverTick = false;
    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);

    Ground = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Ground"));
    Roads = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Roads"));
    Buildings = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Buildings"));
    Park = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Park"));
    TreeTrunks = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("TreeTrunks"));
    TreeTops = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("TreeTops"));

    for (UInstancedStaticMeshComponent* Part : {Ground, Roads, Buildings, Park, TreeTrunks, TreeTops})
        Part->SetupAttachment(Root);

    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cone(TEXT("/Engine/BasicShapes/Cone.Cone"));
    if (Cube.Succeeded())
    {
        for (UInstancedStaticMeshComponent* Part : {Ground, Roads, Buildings, Park, TreeTrunks})
            Part->SetStaticMesh(Cube.Object);
    }
    if (Cone.Succeeded()) TreeTops->SetStaticMesh(Cone.Object);

    TreeTrunks->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    TreeTops->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void ASwipeUpCityBlockout::BeginPlay()
{
    Super::BeginPlay();
    const auto Add = [](UInstancedStaticMeshComponent* Comp, const FVector& Position, const FVector& Scale)
    {
        Comp->AddInstance(FTransform(FRotator::ZeroRotator, Position, Scale));
    };

    // Built-in Engine meshes: no licensed external asset is required for this prototype.
    Add(Ground, FVector(0.f, 0.f, -180.f), FVector(100.f, 100.f, 1.f));

    for (int32 Lane = -2; Lane <= 2; ++Lane)
    {
        const float P = float(Lane) * 1500.f;
        Add(Roads, FVector(P, 0.f, -120.f), FVector(4.f, 100.f, 0.2f));
        Add(Roads, FVector(0.f, P, -120.f), FVector(100.f, 4.f, 0.2f));
    }

    FRandomStream Random(2026);
    for (int32 X = -2; X < 2; ++X)
    {
        for (int32 Y = -2; Y < 2; ++Y)
        {
            const float PX = (float(X) + 0.5f) * 1500.f;
            const float PY = (float(Y) + 0.5f) * 1500.f;
            // One open plaza and one pocket park to show future social spaces.
            if (X == 0 && Y == 0)
            {
                Add(Park, FVector(PX, PY, -110.f), FVector(11.f, 11.f, 0.1f));
                for (int32 T = 0; T < 5; ++T)
                {
                    const float TX = PX + Random.FRandRange(-380.f, 380.f);
                    const float TY = PY + Random.FRandRange(-380.f, 380.f);
                    Add(TreeTrunks, FVector(TX, TY, 90.f), FVector(0.6f, 0.6f, 4.f));
                    Add(TreeTops, FVector(TX, TY, 410.f), FVector(3.5f, 3.5f, 5.f));
                }
                continue;
            }
            if (X == -1 && Y == 0)
            {
                Add(Park, FVector(PX, PY, -110.f), FVector(11.f, 11.f, 0.1f));
                continue;
            }
            const float Height = Random.FRandRange(700.f, 1700.f);
            Add(Buildings, FVector(PX, PY, Height * 0.5f - 110.f),
                FVector(Random.FRandRange(5.2f, 8.5f),
                        Random.FRandRange(5.2f, 8.5f), Height / 100.f));
        }
    }
}
