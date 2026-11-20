#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "SwipeUpCityMobileController.generated.h"

UCLASS()
class SWIPEUPCITY_API ASwipeUpCityMobileController : public APlayerController
{
    GENERATED_BODY()
public:
    ASwipeUpCityMobileController();
    virtual void SetupInputComponent() override;

private:
    void OnTouchPressed(ETouchIndex::Type FingerIndex, FVector Location);
};
