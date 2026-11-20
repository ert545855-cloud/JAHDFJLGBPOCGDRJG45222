#include "SwipeUpCityMobileController.h"
#include "SwipeUpCityCar.h"
#include "SwipeUpCityCharacter.h"
#include "SwipeUpCityGameMode.h"
#include "SwipeUpCityLife.h"
#include "SwipeUpCityLifeLayout.h"
#include "SwipeUpCityTouchLayout.h"
#include "Components/CapsuleComponent.h"
#include "Components/InputComponent.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"

ASwipeUpCityMobileController::ASwipeUpCityMobileController()
{
    bEnableTouchEvents = true;
    bShowMouseCursor = false;
}

void ASwipeUpCityMobileController::SetupInputComponent()
{
    Super::SetupInputComponent();
    if (!InputComponent) return;
    InputComponent->BindTouch(IE_Pressed, this, &ASwipeUpCityMobileController::OnTouchPressed).bExecuteWhenPaused = true;
    InputComponent->BindTouch(IE_Released, this, &ASwipeUpCityMobileController::OnTouchReleased).bExecuteWhenPaused = true;
    InputComponent->BindAction("CityInteract", IE_Pressed, this, &ASwipeUpCityMobileController::Interact);
    InputComponent->BindAction("CityPause", IE_Pressed, this, &ASwipeUpCityMobileController::TogglePause).bExecuteWhenPaused = true;
    InputComponent->BindAction("LifeInteract", IE_Pressed, this, &ASwipeUpCityMobileController::InteractWithPlace);
    InputComponent->BindAction("LifeUp", IE_Pressed, this, &ASwipeUpCityMobileController::LifeUp);
    InputComponent->BindAction("LifeDown", IE_Pressed, this, &ASwipeUpCityMobileController::LifeDown);
    InputComponent->BindAction("RestartTour", IE_Pressed, this, &ASwipeUpCityMobileController::RestartTour).bExecuteWhenPaused = true;
}

ASwipeUpCityCar* ASwipeUpCityMobileController::FindNearbyCar(bool bOwns) const
{
    if (!GetPawn() || !GetWorld()) return nullptr;
    const ASwipeUpCityLife* Life = GetCityLife();
    ASwipeUpCityCar* Closest = nullptr;
    double DistanceSquared = FMath::Square(365.);
    for (TActorIterator<ASwipeUpCityCar> It(GetWorld()); It; ++It)
    {
        if (It->Driver || It->GetController()) continue;
        const bool bHasKey = !Life || Life->GetProfile().OwnsCar(It->GetVehicleType());
        if (bOwns != bHasKey) continue;
        const double Distance = FVector::DistSquared(GetPawn()->GetActorLocation(), It->GetActorLocation());
        if (Distance < DistanceSquared)
        {
            Closest = *It;
            DistanceSquared = Distance;
        }
    }
    return Closest;
}

bool ASwipeUpCityMobileController::HasNearbyCar() const
{
    return FindNearbyCar(true) != nullptr;
}

FString ASwipeUpCityMobileController::NearbyLockedCar() const
{
    if (const ASwipeUpCityCar* Car = FindNearbyCar(false))
        return ASwipeUpCityLife::CarName(Car->GetVehicleType());
    return {};
}

ASwipeUpCityLife* ASwipeUpCityMobileController::GetCityLife() const
{
    const UWorld* World = GetWorld();
    const ASwipeUpCityGameMode* Mode = World ? World->GetAuthGameMode<ASwipeUpCityGameMode>() : nullptr;
    return Mode ? Mode->GetCityLife() : nullptr;
}

void ASwipeUpCityMobileController::InteractWithPlace()
{
    ASwipeUpCityLife* Life = GetCityLife();
    APawn* Pawn = GetPawn();
    if (!Life || !Pawn) return;

    if (bLifeMenu)
    {
        SelectLifeChoice(LifeSelection);
        return;
    }
    if (Life->DanceBeat(*Pawn) || Life->Choices(*Pawn).IsEmpty()) return;

    if (ASwipeUpCityCar* Car = Cast<ASwipeUpCityCar>(Pawn)) Car->Halt();
    if (ASwipeUpCityCharacter* Character = Cast<ASwipeUpCityCharacter>(Pawn))
    {
        Character->StopJumping();
        Character->GetCharacterMovement()->StopMovementImmediately();
    }
    SetIgnoreMoveInput(true);
    SetIgnoreLookInput(true);
    bLifeMenu = true;
    LifeSelection = 0;
}

void ASwipeUpCityMobileController::CloseLifeMenu()
{
    if (!bLifeMenu) return;
    SetIgnoreMoveInput(false);
    SetIgnoreLookInput(false);
    bLifeMenu = false;
}

void ASwipeUpCityMobileController::LifeUp() { MoveLifeSelection(-1); }
void ASwipeUpCityMobileController::LifeDown() { MoveLifeSelection(1); }

void ASwipeUpCityMobileController::MoveLifeSelection(int32 Direction)
{
    if (!bLifeMenu) return;
    const ASwipeUpCityLife* Life = GetCityLife();
    const int32 Count = Life && GetPawn() ? Life->Choices(*GetPawn()).Num() : 0;
    if (Count > 0) LifeSelection = (LifeSelection + Direction + Count) % Count;
}

void ASwipeUpCityMobileController::SelectLifeChoice(int32 Index)
{
    ASwipeUpCityLife* Life = GetCityLife();
    APawn* Pawn = GetPawn();
    if (!Life || !Pawn) { CloseLifeMenu(); return; }
    const TArray<FCityLifeChoice> Items = Life->Choices(*Pawn);
    if (!Items.IsValidIndex(Index)) { CloseLifeMenu(); return; }
    if (Life->Select(Items[Index].Action, *Pawn)) CloseLifeMenu();
}

void ASwipeUpCityMobileController::Interact()
{
    if (bLifeMenu) return;
    if (ASwipeUpCityCar* Car = Cast<ASwipeUpCityCar>(GetPawn()))
    {
        if (!Car->CanExit() || !Car->Driver) return;
        ASwipeUpCityCharacter* Character = Car->Driver;
        const UCapsuleComponent* Capsule = Character->GetCapsuleComponent();
        const FCollisionShape Shape = FCollisionShape::MakeCapsule(
            Capsule->GetScaledCapsuleRadius(), Capsule->GetScaledCapsuleHalfHeight());
        FCollisionQueryParams Params;
        Params.AddIgnoredActor(Car);
        Params.AddIgnoredActor(Character);
        for (int32 Side : {-1, 1})
        {
            const FVector Point = Car->GetActorLocation() + Car->GetActorRightVector() * (Side * 180.)
                + FVector(0, 0, 50);
            if (!GetWorld()->OverlapBlockingTestByChannel(Point, FQuat::Identity, ECC_Pawn, Shape, Params))
            {
                ExitCar(*Car, Point, Car->GetActorRotation());
                return;
            }
        }
        return;
    }

    ASwipeUpCityCharacter* Character = Cast<ASwipeUpCityCharacter>(GetPawn());
    ASwipeUpCityCar* Car = Character ? FindNearbyCar(true) : nullptr;
    if (!Car) return;
    Character->StopJumping();
    Character->GetCharacterMovement()->StopMovementImmediately();
    Character->SetActorHiddenInGame(true);
    Character->SetActorEnableCollision(false);
    HeldJumpOrBrake.Reset();
    Car->Driver = Character;
    Possess(Car);
}

void ASwipeUpCityMobileController::ExitCar(ASwipeUpCityCar& Car, const FVector& Location,
                                            const FRotator& Heading)
{
    ASwipeUpCityCharacter* Character = Car.Driver;
    if (!IsValid(Character)) return;
    Car.Driver = nullptr;
    Car.Halt();
    HeldJumpOrBrake.Reset();
    Character->SetActorLocationAndRotation(Location, Heading, false, nullptr, ETeleportType::TeleportPhysics);
    Character->SetActorHiddenInGame(false);
    Character->SetActorEnableCollision(true);
    Possess(Character);
    SetControlRotation(Heading);
}

void ASwipeUpCityMobileController::RecoverTo(const FVector& Location, const FRotator& Heading)
{
    CloseLifeMenu();
    HeldJumpOrBrake.Reset();
    if (ASwipeUpCityCar* Car = Cast<ASwipeUpCityCar>(GetPawn()))
    {
        if (Car->Driver)
            ExitCar(*Car, Location, Heading);
        Car->ResetToParking();
        return;
    }
    if (ASwipeUpCityCharacter* Character = Cast<ASwipeUpCityCharacter>(GetPawn()))
    {
        Character->StopJumping();
        Character->GetCharacterMovement()->StopMovementImmediately();
        Character->SetActorLocationAndRotation(Location, Heading, false, nullptr, ETeleportType::TeleportPhysics);
        SetControlRotation(Heading);
    }
}

void ASwipeUpCityMobileController::TogglePause()
{
    if (bLifeMenu) { CloseLifeMenu(); return; }
    SetPause(!UGameplayStatics::IsGamePaused(this));
}

void ASwipeUpCityMobileController::RestartTour()
{
    CloseLifeMenu();
    SetPause(false);
    if (ASwipeUpCityGameMode* City = GetWorld()->GetAuthGameMode<ASwipeUpCityGameMode>())
        City->RestartTour();
}

void ASwipeUpCityMobileController::OnTouchPressed(ETouchIndex::Type FingerIndex, FVector Location)
{
    int32 Width = 0, Height = 0;
    GetViewportSize(Width, Height);
    if (Width <= 0 || Height <= 0) return;
    const FVector2D Screen(Width, Height), Tap(Location.X, Location.Y);
    using SwipeUpCityTouch::Button;
    using SwipeUpCityTouch::Region;

    if (bLifeMenu)
    {
        const ASwipeUpCityLife* Life = GetCityLife();
        const int32 Count = Life && GetPawn() ? Life->Choices(*GetPawn()).Num() : 0;
        for (int32 Index = 0; Index < Count; ++Index)
        {
            if (SwipeUpCityLifeLayout::Row(Screen, Index, Count).IsInside(Tap))
            {
                SelectLifeChoice(Index);
                return;
            }
        }
        if (SwipeUpCityLifeLayout::CloseButton(Screen).IsInside(Tap) ||
            !SwipeUpCityLifeLayout::Panel(Screen).IsInside(Tap)) CloseLifeMenu();
        return;
    }

    if (Region(Button::Pause, Screen).IsInside(Tap))
    {
        TogglePause();
        return;
    }
    if (UGameplayStatics::IsGamePaused(this))
    {
        if (Region(Button::Restart, Screen).IsInside(Tap)) RestartTour();
        return;
    }
    if (SwipeUpCityLifeLayout::InteractButton(Screen).IsInside(Tap))
    {
        InteractWithPlace();
        return;
    }
    if (Region(Button::Vehicle, Screen).IsInside(Tap))
    {
        Interact();
        return;
    }
    if (Region(Button::JumpBrake, Screen).IsInside(Tap) && !HeldJumpOrBrake.IsSet())
    {
        HeldJumpOrBrake = FingerIndex;
        if (ASwipeUpCityCar* Car = Cast<ASwipeUpCityCar>(GetPawn()))
            Car->SetBrake(true);
        else if (ASwipeUpCityCharacter* Character = Cast<ASwipeUpCityCharacter>(GetPawn()))
            Character->Jump();
    }
    else if (Region(Button::Run, Screen).IsInside(Tap))
    {
        if (ASwipeUpCityCharacter* Character = Cast<ASwipeUpCityCharacter>(GetPawn()))
            Character->ToggleSprint();
    }
}

void ASwipeUpCityMobileController::OnTouchReleased(ETouchIndex::Type FingerIndex, FVector Location)
{
    if (!HeldJumpOrBrake.IsSet() || HeldJumpOrBrake.GetValue() != FingerIndex) return;
    HeldJumpOrBrake.Reset();
    if (ASwipeUpCityCar* Car = Cast<ASwipeUpCityCar>(GetPawn()))
        Car->SetBrake(false);
    else if (ASwipeUpCityCharacter* Character = Cast<ASwipeUpCityCharacter>(GetPawn()))
        Character->StopJumping();
}
