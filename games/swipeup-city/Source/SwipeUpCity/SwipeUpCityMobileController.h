#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "SwipeUpCityMobileController.generated.h"

class ASwipeUpCityCar;
class ASwipeUpCityLife;

UCLASS()
class SWIPEUPCITY_API ASwipeUpCityMobileController : public APlayerController
{
    GENERATED_BODY()

public:
    ASwipeUpCityMobileController();
    virtual void SetupInputComponent() override;
    bool HasNearbyCar() const;
    bool IsLifeMenuOpen() const { return bLifeMenu; }
    int32 GetLifeSelection() const { return LifeSelection; }
    ASwipeUpCityLife* GetCityLife() const;
    FString NearbyLockedCar() const;
    void RecoverTo(const FVector& Location, const FRotator& Heading);

private:
    ASwipeUpCityCar* FindNearbyCar(bool bOwns) const;
    void InteractWithPlace();
    void LifeUp();
    void LifeDown();
    void MoveLifeSelection(int32 Direction);
    void SelectLifeChoice(int32 Index);
    void CloseLifeMenu();
    void Interact();
    void ExitCar(ASwipeUpCityCar& Car, const FVector& Location, const FRotator& Heading);
    void TogglePause();
    void RestartTour();
    void OnTouchPressed(ETouchIndex::Type FingerIndex, FVector Location);
    void OnTouchReleased(ETouchIndex::Type FingerIndex, FVector Location);

    TOptional<ETouchIndex::Type> HeldJumpOrBrake;
    bool bLifeMenu = false;
    int32 LifeSelection = 0;
};
