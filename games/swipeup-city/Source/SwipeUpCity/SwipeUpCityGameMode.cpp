#include "SwipeUpCityGameMode.h"
#include "SwipeUpCityBlockout.h"
#include "SwipeUpCityCharacter.h"
#include "SwipeUpCityHUD.h"
#include "SwipeUpCityMobileController.h"
#include "Components/TextRenderComponent.h"
#include "Engine/TextRenderActor.h"
#include "Engine/World.h"
#include "GameFramework/PawnMovementComponent.h"
#include "TimerManager.h"

namespace
{
    const FVector Plaza(0, -1050, 120);
    const FRotator PlazaHeading(0, 90, 0);
    constexpr double StopRadius = 360;

    struct FTourStop
    {
        const TCHAR* Name;
        FVector Location;
    };

    const FTourStop Stops[] = {
        {TEXT("Merkez Park"), FVector(1200, 615, 55)},
        {TEXT("Kafe Meydani"), FVector(-1200, -1710, 47)},
        {TEXT("Otopark"), FVector(6000, -4230, 30)},
        {TEXT("Marina"), FVector(4500, -10250, 26)}
    };
}

ASwipeUpCityGameMode::ASwipeUpCityGameMode()
{
    DefaultPawnClass = ASwipeUpCityCharacter::StaticClass();
    PlayerControllerClass = ASwipeUpCityMobileController::StaticClass();
    HUDClass = ASwipeUpCityHUD::StaticClass();
}

void ASwipeUpCityGameMode::StartPlay()
{
    UWorld* World = GetWorld();
    if (!World)
    {
        Super::StartPlay();
        return;
    }
    World->SpawnActor<ASwipeUpCityBlockout>();
    for (const FTourStop& Stop : Stops)
    {
        ATextRenderActor* Marker = World->SpawnActor<ATextRenderActor>(
            Stop.Location + FVector(0, 0, 240), FRotator::ZeroRotator);
        Markers.Add(Marker);
        if (Marker)
        {
            UTextRenderComponent* Label = Marker->GetTextRender();
            Label->SetText(FText::FromString(Stop.Name));
            Label->SetHorizontalAlignment(EHTA_Center);
            Label->SetWorldSize(58.f);
            Label->SetTextRenderColor(FColor(255, 193, 105));
        }
    }

    Super::StartPlay();
    GetWorldTimerManager().SetTimer(TourTimer, this, &ASwipeUpCityGameMode::UpdateTour, 0.1f, true);
}

void ASwipeUpCityGameMode::RestartPlayer(AController* NewPlayer)
{
    if (NewPlayer)
    {
        RestartPlayerAtTransform(NewPlayer, FTransform(PlazaHeading, Plaza));
    }
}

int32 ASwipeUpCityGameMode::GetVisitedCount() const
{
    int32 Count = 0;
    for (int32 Index = 0; Index < GetStopCount(); ++Index)
        Count += (VisitedStops & (1 << Index)) != 0;
    return Count;
}

int32 ASwipeUpCityGameMode::GetStopCount() const
{
    return UE_ARRAY_COUNT(Stops);
}

FString ASwipeUpCityGameMode::GetClosestStop(const FVector& From) const
{
    const FTourStop* Closest = nullptr;
    double Distance = TNumericLimits<double>::Max();
    for (int32 Index = 0; Index < GetStopCount(); ++Index)
    {
        if (VisitedStops & (1 << Index)) continue;
        const double Candidate = FVector::Dist2D(From, Stops[Index].Location);
        if (Candidate < Distance)
        {
            Distance = Candidate;
            Closest = &Stops[Index];
        }
    }

    if (!Closest) return TEXT("Tur tamamlandi. Sehir seni bekliyor.");

    const FVector Offset = Closest->Location - From;
    const double Degrees = FMath::RadiansToDegrees(FMath::Atan2(Offset.X, Offset.Y));
    const TCHAR* Directions[] = {TEXT("K"), TEXT("KD"), TEXT("D"), TEXT("GD"),
        TEXT("G"), TEXT("GB"), TEXT("B"), TEXT("KB")};
    const int32 Direction = (FMath::RoundToInt(Degrees / 45.0) + 8) % 8;
    return FString::Printf(TEXT("%s  |  %d m  %s"), Closest->Name,
        FMath::RoundToInt(Distance / 100.0), Directions[Direction]);
}

void ASwipeUpCityGameMode::ReturnToPlaza(APawn* Pawn) const
{
    if (!Pawn) return;
    if (UPawnMovementComponent* Movement = Pawn->GetMovementComponent())
        Movement->StopMovementImmediately();
    Pawn->SetActorLocationAndRotation(Plaza, PlazaHeading, false, nullptr, ETeleportType::TeleportPhysics);
    if (AController* Controller = Pawn->GetController())
        Controller->SetControlRotation(PlazaHeading);
}

void ASwipeUpCityGameMode::RestartTour()
{
    VisitedStops = 0;
    for (ATextRenderActor* Marker : Markers)
    {
        if (Marker)
            Marker->GetTextRender()->SetTextRenderColor(FColor(255, 193, 105));
    }
    if (APlayerController* Player = GetWorld()->GetFirstPlayerController())
        ReturnToPlaza(Player->GetPawn());
}

void ASwipeUpCityGameMode::UpdateTour()
{
    APlayerController* Player = GetWorld()->GetFirstPlayerController();
    APawn* Pawn = Player ? Player->GetPawn() : nullptr;
    if (!Pawn) return;
    const FVector Position = Pawn->GetActorLocation();
    if (Position.Z < -150.f || FMath::Abs(Position.X) > 11900.f ||
        Position.Y > 10900.f || Position.Y < -14000.f)
    {
        ReturnToPlaza(Pawn);
        return;
    }

    for (int32 Index = 0; Index < GetStopCount(); ++Index)
    {
        if (ATextRenderActor* Marker = Markers[Index])
        {
            const FVector ToPlayer = Position - Marker->GetActorLocation();
            Marker->SetActorRotation(FRotator(0, ToPlayer.Rotation().Yaw, 0));
        }
        if (!(VisitedStops & (1 << Index))
            && FMath::Abs(Position.Z - Stops[Index].Location.Z) < 300.f
            && FVector::DistSquared2D(Position, Stops[Index].Location) < FMath::Square(StopRadius))
        {
            VisitedStops |= 1 << Index;
            if (ATextRenderActor* Marker = Markers[Index])
                Marker->GetTextRender()->SetTextRenderColor(FColor(112, 235, 164));
        }
    }
}
