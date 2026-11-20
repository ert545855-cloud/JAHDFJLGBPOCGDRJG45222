#include "SwipeUpCityPedestrian.h"
#include "Components/SceneComponent.h"

ASwipeUpCityPedestrian::ASwipeUpCityPedestrian()
{
    PrimaryActorTick.bCanEverTick = true;
    SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("PedestrianOrigin")));
}

void ASwipeUpCityPedestrian::Configure(const TArray<FVector>& Route, float WalkSpeed, int32 StartIndex,
                                       float Scale, int32 Style)
{
    if (Route.Num() < 2) return;
    Waypoints = Route;
    Speed = WalkSpeed;
    const int32 Start = StartIndex % Waypoints.Num();
    NextStop = (Start + 1) % Waypoints.Num();
    SetActorLocationAndRotation(Waypoints[Start], (Waypoints[NextStop] - Waypoints[Start]).Rotation());
    if (GetNetMode() != NM_DedicatedServer)
        Avatar.Attach(*this, *GetRootComponent(), FVector::ZeroVector, Scale, Style);
}

void ASwipeUpCityPedestrian::ConfigureActivity(const FVector& Location, const FRotator& Face,
    float Phase, int32 Style)
{
    bActivity = true;
    SetActorLocationAndRotation(Location, Face);
    if (GetNetMode() != NM_DedicatedServer)
    {
        Avatar.Attach(*this, *GetRootComponent(), FVector::ZeroVector, 1.f, Style);
        Avatar.Animate(Phase, 0.f, true);
    }
}

void ASwipeUpCityPedestrian::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    if (bActivity)
    {
        Avatar.Animate(DeltaTime, 0.f, true);
        return;
    }
    if (Waypoints.IsEmpty()) return;
    const FVector Delta = Waypoints[NextStop] - GetActorLocation();
    const double Step = Speed * DeltaTime;
    if (Delta.SizeSquared() <= FMath::Square(Step))
    {
        SetActorLocation(Waypoints[NextStop]);
        NextStop = (NextStop + 1) % Waypoints.Num();
    }
    else
    {
        AddActorWorldOffset(Delta.GetSafeNormal() * Step);
        SetActorRotation(FMath::RInterpTo(GetActorRotation(), Delta.Rotation(), DeltaTime, 8.f));
    }
    Avatar.Animate(DeltaTime, Speed);
}
