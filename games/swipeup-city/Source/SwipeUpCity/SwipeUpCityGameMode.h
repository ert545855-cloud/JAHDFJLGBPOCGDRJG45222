#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "SwipeUpCityGameMode.generated.h"

class ATextRenderActor;

UCLASS()
class SWIPEUPCITY_API ASwipeUpCityGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    ASwipeUpCityGameMode();
    virtual void StartPlay() override;
    virtual void RestartPlayer(AController* NewPlayer) override;

    int32 GetVisitedCount() const;
    int32 GetStopCount() const;
    FString GetClosestStop(const FVector& From) const;
    void RestartTour();

private:
    void UpdateTour();
    void ReturnToPlaza(APawn* Pawn) const;

    UPROPERTY()
    TArray<TObjectPtr<ATextRenderActor>> Markers;

    uint8 VisitedStops = 0;
    FTimerHandle TourTimer;
};
