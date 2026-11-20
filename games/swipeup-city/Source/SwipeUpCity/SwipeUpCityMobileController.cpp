#include "SwipeUpCityMobileController.h"
#include "SwipeUpCityCharacter.h"
#include "SwipeUpCityGameMode.h"
#include "Engine/World.h"
#include "Components/InputComponent.h"

ASwipeUpCityMobileController::ASwipeUpCityMobileController()
{
    bEnableTouchEvents = true;
    bShowMouseCursor = false;
}

void ASwipeUpCityMobileController::SetupInputComponent()
{
    Super::SetupInputComponent();
    if (InputComponent)
    {
        InputComponent->BindTouch(IE_Pressed, this, &ASwipeUpCityMobileController::OnTouchPressed);
        InputComponent->BindAction("RestartTour", IE_Pressed, this, &ASwipeUpCityMobileController::RestartTour);
    }
}

void ASwipeUpCityMobileController::OnTouchPressed(ETouchIndex::Type FingerIndex, FVector Location)
{
    int32 Width = 0, Height = 0;
    GetViewportSize(Width, Height);
    if (Width <= 0 || Height <= 0) return;

    const FVector2D Tap(Location.X, Location.Y);
    const float Radius = FMath::Clamp(float(Height) * 0.07f, 38.f, 90.f);
    ASwipeUpCityCharacter* Character = Cast<ASwipeUpCityCharacter>(GetPawn());
    if (!Character) return;

    if (FVector2D::Distance(Tap, FVector2D(Width * 0.88f, Height * 0.49f)) < Radius)
        Character->Jump();
    else if (FVector2D::Distance(Tap, FVector2D(Width * 0.88f, Height * 0.30f)) < Radius)
        Character->ToggleSprint();
}

void ASwipeUpCityMobileController::RestartTour()
{
    if (ASwipeUpCityGameMode* City = GetWorld()->GetAuthGameMode<ASwipeUpCityGameMode>())
        City->RestartTour();
}
