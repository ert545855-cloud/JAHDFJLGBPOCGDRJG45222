#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "SwipeUpCityCar.generated.h"

class UBoxComponent;
class UCameraComponent;
class USpringArmComponent;
class ASwipeUpCityCharacter;

UCLASS()
class SWIPEUPCITY_API ASwipeUpCityCar : public APawn
{
    GENERATED_BODY()

public:
    ASwipeUpCityCar();
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
    void SetBrake(bool bPressed) { bBraking = bPressed; }
    bool CanExit() const { return FMath::Abs(Speed) <= 400.f; }
    float GetSpeedKmh() const { return FMath::Abs(Speed) * 0.036f; }
    void SetPaintStyle(int32 Style) { PaintStyle = Style; }
    void Halt();
    void ResetToParking();

    UPROPERTY()
    TObjectPtr<ASwipeUpCityCharacter> Driver;

private:
    void SetThrottle(float Value);
    void SetSteering(float Value);
    void StartBrake() { SetBrake(true); }
    void StopBrake() { SetBrake(false); }

    UPROPERTY()
    TObjectPtr<UBoxComponent> Chassis;
    UPROPERTY()
    TObjectPtr<USpringArmComponent> Arm;
    UPROPERTY()
    TObjectPtr<UCameraComponent> Camera;
    UPROPERTY()
    TArray<TObjectPtr<USceneComponent>> WheelHubs;
    UPROPERTY()
    TArray<TObjectPtr<USceneComponent>> Wheels;

    FTransform Parking;
    int32 PaintStyle = 0;
    float Throttle = 0.f;
    float Steering = 0.f;
    float Speed = 0.f;
    float WheelRoll = 0.f;
    bool bBraking = false;
};
