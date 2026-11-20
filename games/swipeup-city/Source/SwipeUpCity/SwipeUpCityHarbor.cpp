#include "SwipeUpCityHarbor.h"
#include "SwipeUpCityMesh.h"
#include "Components/BoxComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/World.h"

namespace
{
    struct FHarborSolid
    {
        FVector Center;
        FVector Size;
    };

#include "SwipeUpCityHarborGeometry.inl"
}

ASwipeUpCityHarbor::ASwipeUpCityHarbor()
{
    SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("HarborOrigin")));
    PrimaryActorTick.bCanEverTick = false;
}

void ASwipeUpCityHarbor::BeginPlay()
{
    Super::BeginPlay();
    for (const FHarborSolid& Solid : HarborSolids)
    {
        UBoxComponent* Collider = NewObject<UBoxComponent>(this);
        Collider->SetupAttachment(GetRootComponent());
        Collider->SetRelativeLocation(Solid.Center);
        Collider->SetBoxExtent(Solid.Size * 0.5);
        Collider->SetCollisionProfileName(TEXT("BlockAll"));
        Collider->SetHiddenInGame(true);
        Collider->SetCanEverAffectNavigation(false);
        AddInstanceComponent(Collider);
        Collider->RegisterComponent();
    }

    if (GetNetMode() == NM_DedicatedServer) return;
    for (const TCHAR* Mesh : HarborMeshNames)
        SwipeUpCityMesh::Add(*this, *GetRootComponent(), Mesh);

    if (ADirectionalLight* Sun = GetWorld()->SpawnActor<ADirectionalLight>(
        FVector(0, 0, 10000), FRotator(-42, -35, 0)))
    {
        ULightComponent* Light = Sun->GetLightComponent();
        Light->SetMobility(EComponentMobility::Movable);
        Light->SetIntensity(4.05f);
        Light->SetLightColor(FLinearColor(1.0f, 0.87f, 0.71f));
    }
    if (ASkyLight* Sky = GetWorld()->SpawnActor<ASkyLight>())
    {
        USkyLightComponent* Light = Sky->GetLightComponent();
        Light->SetMobility(EComponentMobility::Movable);
        Light->SetIntensity(1.12f);
        Light->RecaptureSky();
    }
}
