#include "SwipeUpCityAvatar.h"
#include "SwipeUpCityMesh.h"
#include "Components/SceneComponent.h"
#include "GameFramework/Actor.h"

namespace
{
    USceneComponent* Joint(AActor& Owner, USceneComponent& Parent, const FVector& Position)
    {
        USceneComponent* Scene = NewObject<USceneComponent>(&Owner);
        Scene->SetupAttachment(&Parent);
        Scene->SetRelativeLocation(Position);
        Owner.AddInstanceComponent(Scene);
        Scene->RegisterComponent();
        return Scene;
    }
}

void FSwipeUpCityAvatar::Attach(AActor& Owner, USceneComponent& Parent, const FVector& Feet, float Scale, int32 Style)
{
    Ground = Feet;
    Body = Joint(Owner, Parent, Feet);
    Body->SetRelativeScale3D(FVector(Scale));
    const FString Suffix = FString::FromInt(Style);
    const auto AddPart = [&Owner, &Suffix](USceneComponent& Parent, const TCHAR* Part)
    {
        SwipeUpCityMesh::Add(Owner, Parent, *(FString(Part) + Suffix));
    };
    AddPart(*Body, TEXT("AvatarBody"));
    for (int32 Index = 0; Index < 2; ++Index)
    {
        const float Side = Index == 0 ? -1.f : 1.f;
        FLimbs& Limbs = Sides[Index];
        Limbs.Arm = Joint(Owner, *Body, FVector(0, Side * 23, 130));
        Limbs.Forearm = Joint(Owner, *Limbs.Arm, FVector(0, Side * 2, -25));
        Limbs.Thigh = Joint(Owner, *Body, FVector(0, Side * 10, 87));
        Limbs.Shin = Joint(Owner, *Limbs.Thigh, FVector(0, 0, -40));
        AddPart(*Limbs.Arm, TEXT("AvatarArm"));
        AddPart(*Limbs.Forearm, TEXT("AvatarForearm"));
        AddPart(*Limbs.Thigh, TEXT("AvatarLeg"));
        AddPart(*Limbs.Shin, TEXT("AvatarShin"));
    }
}

void FSwipeUpCityAvatar::Animate(float DeltaTime, float Speed, bool bStretch)
{
    if (!Body) return;
    Motion = FMath::FInterpTo(Motion, FMath::Clamp(Speed / 420.f, 0.f, 1.25f), DeltaTime, 8.f);
    Phase = FMath::Fmod(Phase + DeltaTime * (4.f + Motion * 6.f), 2.f * PI);
    const float Wave = FMath::Sin(Phase) * Motion;
    Body->SetRelativeRotation(FRotator(0, 0, bStretch ? FMath::Sin(Phase * .56f) * 8.f : 0.f));

    Body->SetRelativeLocation(Ground + FVector(0, 0, 2.4f * FMath::Abs(Wave)));
    for (int32 Index = 0; Index < 2; ++Index)
    {
        const float Side = Index == 0 ? -1.f : 1.f;
        const float Stride = Side * Wave;
        const FLimbs& Limbs = Sides[Index];
        const float Reach = bStretch ? 70.f + FMath::Sin(Phase * .6f) * 39.f : 8.f;
        Limbs.Arm->SetRelativeRotation(FRotator(Stride * 28.f, 0, Side * Reach));
        Limbs.Forearm->SetRelativeRotation(FRotator(-9.f - FMath::Max(0.f, Stride) * 39.f, 0, 0));
        Limbs.Thigh->SetRelativeRotation(FRotator(-Stride * 35.f, 0, Side * 2.f));
        Limbs.Shin->SetRelativeRotation(FRotator(FMath::Max(0.f, Stride) * 46.f, 0, 0));
    }
}
