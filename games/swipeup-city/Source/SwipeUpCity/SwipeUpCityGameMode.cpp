#include "SwipeUpCityGameMode.h"
#include "SwipeUpCityBlockout.h"
#include "SwipeUpCityCharacter.h"
#include "SwipeUpCityHUD.h"
#include "SwipeUpCityMobileController.h"
#include "Engine/World.h"

ASwipeUpCityGameMode::ASwipeUpCityGameMode()
{
    DefaultPawnClass = ASwipeUpCityCharacter::StaticClass();
    PlayerControllerClass = ASwipeUpCityMobileController::StaticClass();
    HUDClass = ASwipeUpCityHUD::StaticClass();
}

void ASwipeUpCityGameMode::StartPlay()
{
    Super::StartPlay();
    if (UWorld* World = GetWorld())
    {
        FActorSpawnParameters Params;
        Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
        World->SpawnActor<ASwipeUpCityBlockout>(
            ASwipeUpCityBlockout::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, Params);
    }
}
