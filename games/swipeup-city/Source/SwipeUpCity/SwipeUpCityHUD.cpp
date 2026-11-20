#include "SwipeUpCityHUD.h"
#include "SwipeUpCityCar.h"
#include "SwipeUpCityGameMode.h"
#include "SwipeUpCityMobileController.h"
#include "SwipeUpCityTouchLayout.h"
#include "Engine/Canvas.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

void ASwipeUpCityHUD::DrawHUD()
{
    Super::DrawHUD();
    if (!Canvas || !PlayerOwner) return;

    const FVector2D Screen(Canvas->SizeX, Canvas->SizeY);
    const FLinearColor Ink(.035f, .13f, .17f, .88f);
    const FLinearColor Sand(1.f, .80f, .53f, 1.f);
    const FLinearColor White(1.f, .97f, .90f, 1.f);
    const float Margin = 16.f;
    const ASwipeUpCityGameMode* City = GetWorld()->GetAuthGameMode<ASwipeUpCityGameMode>();
    const APawn* Pawn = PlayerOwner->GetPawn();
    const ASwipeUpCityCar* Car = Cast<ASwipeUpCityCar>(Pawn);
    const ASwipeUpCityMobileController* Controller = Cast<ASwipeUpCityMobileController>(PlayerOwner);
    const bool bNearCar = !Car && Controller && Controller->HasNearbyCar();

    if (City && Pawn)
    {
        DrawRect(Ink, Margin, Margin, FMath::Min(Screen.X * .58, 263.), 67.f);
        const int32 Visited = City->GetVisitedCount();
        const int32 Total = City->GetStopCount();
        DrawText(FString::Printf(TEXT("LIMAN TURU    %d / %d"), Visited, Total), Sand, Margin + 11.f, Margin + 8.f);
        DrawText(City->GetClosestStop(Pawn->GetActorLocation()), White, Margin + 11.f, Margin + 34.f);
    }

    if (Car)
    {
        DrawRect(Ink, Margin, 92.f, 92.f, 31.f);
        DrawText(FString::Printf(TEXT("%d km/h"), FMath::RoundToInt(Car->GetSpeedKmh())), White, Margin + 10.f, 100.f);
    }

    const bool bTouch = UGameplayStatics::GetPlatformName() == TEXT("Android")
        || UGameplayStatics::GetPlatformName() == TEXT("IOS");
    const bool bPaused = UGameplayStatics::IsGamePaused(this);
    if (bPaused)
    {
        DrawRect(Ink, Screen.X * .25, Screen.Y * .29, Screen.X * .50, Screen.Y * .30);
        DrawText(TEXT("OYUN DURAKLATILDI"), Sand, Screen.X * .31, Screen.Y * .33);
        if (!bTouch)
            DrawText(TEXT("Esc Devam     R Bastan basla"), White, Screen.X * .31, Screen.Y * .44);
    }

    if (!bTouch)
    {
        if (bPaused) return;
        const TCHAR* Help = Car ? TEXT("WASD Sur   Space Fren   E In   Esc Duraklat") :
            bNearCar ? TEXT("E Araca bin   WASD Hareket   Space Zipla") :
            TEXT("WASD Hareket   Shift Kos   Space Zipla   Esc Duraklat");
        DrawText(Help, White, Margin, Screen.Y - 31.f);
        return;
    }

    using SwipeUpCityTouch::Button;
    const auto DrawButton = [&](Button Control, const FString& Label)
    {
        const FBox2D Area = SwipeUpCityTouch::Region(Control, Screen);
        const FVector2D Size = Area.GetSize();
        DrawRect(Ink, Area.Min.X, Area.Min.Y, Size.X, Size.Y);
        float Width = 0.f, Height = 0.f;
        GetTextSize(Label, Width, Height, nullptr, 1.f);
        DrawText(Label, White, Area.Min.X + (Size.X - Width) * .5, Area.Min.Y + (Size.Y - Height) * .5);
    };
    DrawButton(Button::Pause, bPaused ? TEXT("DEVAM") : TEXT("II"));
    if (bPaused)
    {
        DrawButton(Button::Restart, TEXT("BASTAN BASLA"));
        return;
    }
    if (!Car) DrawButton(Button::Run, TEXT("KOS"));
    DrawButton(Button::JumpBrake, Car ? TEXT("FREN") : TEXT("ZIPLA"));
    if (Car || bNearCar) DrawButton(Button::Vehicle, Car ? TEXT("IN") : TEXT("BIN"));
}
