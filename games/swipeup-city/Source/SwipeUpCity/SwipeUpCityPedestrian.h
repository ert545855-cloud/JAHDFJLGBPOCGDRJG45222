#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SwipeUpCityAvatar.h"
#include "SwipeUpCityPedestrian.generated.h"

UCLASS()
class SWIPEUPCITY_API ASwipeUpCityPedestrian : public AActor
{
    GENERATED_BODY()

public:
    ASwipeUpCityPedestrian();
    void Configure(const TArray<FVector>& Route, float WalkSpeed, int32 StartIndex, float Scale, int32 Style);
    virtual void Tick(float DeltaTime) override;

private:
    TArray<FVector> Waypoints;
    FSwipeUpCityAvatar Avatar;
    int32 NextStop = 0;
    float Speed = 0.f;
};
