#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "SwipeUpCityLifeSave.generated.h"

UCLASS()
class SWIPEUPCITY_API USwipeUpCityLifeSave : public USaveGame
{
    GENERATED_BODY()

public:
    UPROPERTY()
    int64 Revision = 0;

    UPROPERTY()
    TArray<int32> Data;
};
