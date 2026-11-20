#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "SwipeUpCityCharacter.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UStaticMeshComponent;

UCLASS()
class SWIPEUPCITY_API ASwipeUpCityCharacter : public ACharacter
{
    GENERATED_BODY()
public:
    ASwipeUpCityCharacter();
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

    UFUNCTION(BlueprintCallable, Category="SwipeUp City|Controls")
    void ToggleSprint();

    UFUNCTION(BlueprintPure, Category="SwipeUp City|Controls")
    bool IsSprinting() const { return bSprinting; }

private:
    UPROPERTY(VisibleAnywhere, Category="Camera")
    USpringArmComponent* CameraBoom;

    UPROPERTY(VisibleAnywhere, Category="Camera")
    UCameraComponent* FollowCamera;

    UPROPERTY(VisibleAnywhere, Category="Prototype")
    UStaticMeshComponent* PlaceholderBody;

    bool bSprinting = false;

    void MoveForward(float Value);
    void MoveRight(float Value);
    void Turn(float Value);
    void LookUp(float Value);
    void StartSprint();
    void StopSprint();
    void SetSprinting(bool bEnable);
};
