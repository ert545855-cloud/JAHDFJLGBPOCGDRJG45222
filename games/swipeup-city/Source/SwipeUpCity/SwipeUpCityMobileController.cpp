#include "SwipeUpCityMobileController.h"
#include "SwipeUpCityCharacter.h"
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
        InputComponent->BindTouch(IE_Pressed, this, &ASwipeUpCityMobileController::OnTouchPressed);
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

    if (FVector2D::Distance(Tap, FVector2D(Width * 0.88f, Height * 0.58f)) < Radius)
        Character->Jump();
    else if (FVector2D::Distance(Tap, FVector2D(Width * 0.88f, Height * 0.40f)) < Radius)
        Character->ToggleSprint();
}
