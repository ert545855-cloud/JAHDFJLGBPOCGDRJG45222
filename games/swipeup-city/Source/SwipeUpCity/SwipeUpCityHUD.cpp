#include "SwipeUpCityHUD.h"
#include "Engine/Canvas.h"

void ASwipeUpCityHUD::DrawHUD()
{
    Super::DrawHUD();
    if (!Canvas) return;

    const float W = Canvas->SizeX;
    const float H = Canvas->SizeY;
    const float Size = FMath::Clamp(H * 0.12f, 76.f, 150.f);
    const FLinearColor Background(0.22f, 0.14f, 0.40f, 0.70f);
    const FLinearColor Foreground(1.f, 1.f, 1.f, 1.f);

    const float X = W * 0.88f - Size / 2.f;
    const float RunY = H * 0.40f - Size / 2.f;
    const float JumpY = H * 0.58f - Size / 2.f;
    DrawRect(Background, X, RunY, Size, Size);
    DrawRect(Background, X, JumpY, Size, Size);
    DrawText(TEXT("KOS"), Foreground, X + Size * 0.24f, RunY + Size * 0.39f);
    DrawText(TEXT("ZIPLA"), Foreground, X + Size * 0.15f, JumpY + Size * 0.39f);
    DrawText(TEXT("SwipeUp City | Prototip"), Foreground, 24.f, 24.f);
}
