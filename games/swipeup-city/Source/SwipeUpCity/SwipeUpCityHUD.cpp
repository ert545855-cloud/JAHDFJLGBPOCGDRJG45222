#include "SwipeUpCityHUD.h"
#include "SwipeUpCityGameMode.h"
#include "Engine/Canvas.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"

void ASwipeUpCityHUD::DrawHUD()
{
    Super::DrawHUD();
    if (!Canvas || !PlayerOwner) return;

    const float W = Canvas->SizeX;
    const float H = Canvas->SizeY;
    const FLinearColor Background(0.025f, 0.055f, 0.085f, 0.84f);
    const FLinearColor Foreground = FLinearColor::White;
    const FLinearColor Accent(1.f, 0.72f, 0.33f);
    const float Margin = FMath::Clamp(W * 0.035f, 12.f, 24.f);

    const ASwipeUpCityGameMode* City = GetWorld()->GetAuthGameMode<ASwipeUpCityGameMode>();
    if (City && PlayerOwner->GetPawn())
    {
        DrawRect(Background, Margin, Margin, FMath::Min(W - Margin * 2, 260.f), 72.f);
        DrawText(FString::Printf(TEXT("SEHIR TURU  %d / %d"),
            City->GetVisitedCount(), City->GetStopCount()), Accent, Margin + 12.f, Margin + 10.f);
        DrawText(City->GetClosestStop(PlayerOwner->GetPawn()->GetActorLocation()),
            Foreground, Margin + 12.f, Margin + 37.f);
    }

    const bool bTouch = UGameplayStatics::GetPlatformName() == TEXT("Android")
        || UGameplayStatics::GetPlatformName() == TEXT("IOS");
    if (!bTouch)
    {
        DrawText(TEXT("WASD Hareket   Shift Kos   Space Zipla   R Bastan basla"),
            Foreground, Margin, H - 34.f);
        return;
    }

    const float Size = FMath::Clamp(H * 0.14f, 76.f, 150.f);
    const float X = W * 0.88f - Size / 2.f;
    const float RunY = H * 0.30f - Size / 2.f;
    const float JumpY = H * 0.49f - Size / 2.f;
    DrawRect(Background, X, RunY, Size, Size);
    DrawRect(Background, X, JumpY, Size, Size);
    DrawText(TEXT("KOS"), Foreground, X + Size * 0.24f, RunY + Size * 0.39f);
    DrawText(TEXT("ZIPLA"), Foreground, X + Size * 0.15f, JumpY + Size * 0.39f);
}
