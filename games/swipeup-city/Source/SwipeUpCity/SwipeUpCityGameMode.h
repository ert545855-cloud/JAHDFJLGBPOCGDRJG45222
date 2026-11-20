#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "SwipeUpCityGameMode.generated.h"

UCLASS()
class SWIPEUPCITY_API ASwipeUpCityGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    ASwipeUpCityGameMode();
    virtual void StartPlay() override;
};
