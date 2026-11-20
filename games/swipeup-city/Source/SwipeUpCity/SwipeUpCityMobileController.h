#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "SwipeUpCityMobileController.generated.h"

class ASwipeUpCityCar;

UCLASS()
class SWIPEUPCITY_API ASwipeUpCityMobileController : public APlayerController
{
    GENERATED_BODY()

public:
    ASwipeUpCityMobileController();
    virtual void SetupInputComponent() override;
    bool HasNearbyCar() const;
    void RecoverTo(const FVector& Location, const FRotator& Heading);

private:
    ASwipeUpCityCar* FindNearbyCar() const;
    void Interact();
    void ExitCar(ASwipeUpCityCar& Car, const FVector& Location, const FRotator& Heading);
    void TogglePause();
    void RestartTour();
    void OnTouchPressed(ETouchIndex::Type FingerIndex, FVector Location);
    void OnTouchReleased(ETouchIndex::Type FingerIndex, FVector Location);

    TOptional<ETouchIndex::Type> HeldJumpOrBrake;
};
