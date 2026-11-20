#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SwipeUpCityBlockout.generated.h"

class UInstancedStaticMeshComponent;

UCLASS()
class SWIPEUPCITY_API ASwipeUpCityBlockout : public AActor
{
    GENERATED_BODY()
public:
    ASwipeUpCityBlockout();
    virtual void BeginPlay() override;

private:
    UPROPERTY(VisibleAnywhere)
    UInstancedStaticMeshComponent* Ground;
    UPROPERTY(VisibleAnywhere)
    UInstancedStaticMeshComponent* Roads;
    UPROPERTY(VisibleAnywhere)
    UInstancedStaticMeshComponent* Buildings;
    UPROPERTY(VisibleAnywhere)
    UInstancedStaticMeshComponent* Park;
    UPROPERTY(VisibleAnywhere)
    UInstancedStaticMeshComponent* TreeTrunks;
    UPROPERTY(VisibleAnywhere)
    UInstancedStaticMeshComponent* TreeTops;
};
