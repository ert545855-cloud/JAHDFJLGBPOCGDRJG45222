#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "SwipeUpCityHUD.generated.h"

UCLASS()
class SWIPEUPCITY_API ASwipeUpCityHUD : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;
};
