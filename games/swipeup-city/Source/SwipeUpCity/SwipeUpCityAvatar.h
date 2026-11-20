#pragma once

#include "CoreMinimal.h"

class AActor;
class USceneComponent;

struct FSwipeUpCityAvatar
{
    void Attach(AActor& Owner, USceneComponent& Parent, const FVector& Feet, float Scale = 1.f, int32 Style = 0);
    void Animate(float DeltaTime, float Speed);

private:
    struct FLimbs
    {
        USceneComponent* Arm = nullptr;
        USceneComponent* Forearm = nullptr;
        USceneComponent* Thigh = nullptr;
        USceneComponent* Shin = nullptr;
    };
    USceneComponent* Body = nullptr;
    FLimbs Sides[2];
    FVector Ground;
    float Phase = 0.f;
    float Motion = 0.f;
};
