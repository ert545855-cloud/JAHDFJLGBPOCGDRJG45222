#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SwipeUpCityHarbor.generated.h"

UCLASS()
class SWIPEUPCITY_API ASwipeUpCityHarbor : public AActor
{
    GENERATED_BODY()

public:
    ASwipeUpCityHarbor();
    virtual void BeginPlay() override;
};
