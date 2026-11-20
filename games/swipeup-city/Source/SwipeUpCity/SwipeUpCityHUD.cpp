#include "SwipeUpCityHUD.h"
#include "SwipeUpCityCar.h"
#include "SwipeUpCityGameMode.h"
#include "SwipeUpCityLife.h"
#include "SwipeUpCityLifeLayout.h"
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
    const ASwipeUpCityLife* Life = City ? City->GetCityLife() : nullptr;
    const bool bTouch = UGameplayStatics::GetPlatformName() == TEXT("Android")
        || UGameplayStatics::GetPlatformName() == TEXT("IOS");
    const bool bPaused = UGameplayStatics::IsGamePaused(this);
    const TArray<FCityLifeChoice> Choices = Life && Pawn ? Life->Choices(*Pawn) : TArray<FCityLifeChoice>();
    const auto DrawWithin = [&](const FString& Text, const FLinearColor& Color, double X, double Y, double MaxWidth)
    {
        float Width = 0.f, Height = 0.f;
        GetTextSize(Text, Width, Height, nullptr, 1.f);
        const float Scale = Width > 0.f ? FMath::Min(1.f, static_cast<float>(MaxWidth / Width)) : 1.f;
        DrawText(Text, Color, X, Y, nullptr, Scale);
    };
    const auto DrawArea = [&](const FBox2D& Area, const FLinearColor& Color)
    {
        const FVector2D Size = Area.GetSize();
        DrawRect(Color, Area.Min.X, Area.Min.Y, Size.X, Size.Y);
    };

    if (Life && Pawn && Controller && Controller->IsLifeMenuOpen())
    {
        using namespace SwipeUpCityLifeLayout;
        const FBox2D Menu = Panel(Screen);
        DrawRect(FLinearColor(0.018f, .066f, .082f, .63f), 0, 0, Screen.X, Screen.Y);
        DrawArea(Menu, FLinearColor(.025f, .10f, .13f, .98f));
        const FBox2D Close = CloseButton(Screen);
        DrawArea(Close, Ink);
        DrawText(TEXT("X"), White, Close.Min.X + 17., Close.Min.Y + 4.);
        DrawWithin(ASwipeUpCityLife::PlaceName(Life->FindPlace(*Pawn)), Sand, Menu.Min.X + 14.,
            Menu.Min.Y + 9., Menu.GetSize().X - 72.);
        const auto& Wallet = Life->GetProfile();
        const FString Summary = Life->FindPlace(*Pawn) == SwipeUpCityLife::Place::Cafe && Wallet.CafeLevel ?
            FString::Printf(TEXT("%d kredi   •   Seviye %d   •   Stok %d/%d"), Wallet.Cash, Wallet.CafeLevel,
                Wallet.Supplies, Wallet.Capacity()) : FString::Printf(TEXT("%d kredi"), Wallet.Cash);
        DrawWithin(Summary, White, Menu.Min.X + 14., Menu.Min.Y + 24., Menu.GetSize().X - 72.);
        for (int32 I = 0; I < Choices.Num(); ++I)
        {
            const FBox2D Area = Row(Screen, I, Choices.Num());
            const bool bSelected = I == Controller->GetLifeSelection() && !bTouch;
            DrawArea(Area, bSelected ? FLinearColor(.12f, .36f, .39f, 1.f) :
                FLinearColor(.075f, .22f, .25f, 1.f));
            DrawWithin(Choices[I].Label, White, Area.Min.X + 11., Area.Min.Y + (Area.GetSize().Y - 15.) * .5,
                Area.GetSize().X - 22.);
        }
        if (!Life->GetNotice().IsEmpty())
            DrawWithin(Life->GetNotice(), Sand, Menu.Min.X + 13., Menu.Max.Y - 35., Menu.GetSize().X - 26.);
        if (!bTouch)
            DrawWithin(TEXT("Yukarı / Aşağı  Seç   F  Onay   Esc  Kapat"), White, Menu.Min.X + 13.,
                Menu.Max.Y - 19., Menu.GetSize().X - 26.);
        return;
    }

    if (City && Pawn)
    {
        DrawRect(Ink, Margin, Margin, FMath::Min(Screen.X * .58, 263.), 67.f);
        const int32 Visited = City->GetVisitedCount();
        const int32 Total = City->GetStopCount();
        DrawText(FString::Printf(TEXT("LIMAN TURU    %d / %d"), Visited, Total), Sand, Margin + 11.f, Margin + 8.f);
        DrawText(City->GetClosestStop(Pawn->GetActorLocation()), White, Margin + 11.f, Margin + 34.f);
    }

    const double CardWidth = FMath::Min(Screen.X * .58, 263.);
    if (Life && Pawn)
    {
        const auto& Wallet = Life->GetProfile();
        DrawRect(Ink, Margin, 91.f, CardWidth, 29.f);
        DrawWithin(FString::Printf(TEXT("%d kredi   •   %d sosyal puan"), Wallet.Cash, Wallet.Community),
            Sand, Margin + 10.f, 98.f, CardWidth - 20.);
        const FString Task = Life->CurrentTask(*Pawn);
        if (!Task.IsEmpty())
        {
            DrawRect(Ink, Margin, 123.f, CardWidth, 32.f);
            DrawWithin(Task, White, Margin + 10.f, 132.f, CardWidth - 20.);
        }
        if (!Life->GetNotice().IsEmpty())
        {
            const double NoticeWidth = FMath::Min(Screen.X * .63, 430.);
            const double NoticeX = (Screen.X - NoticeWidth) * .5;
            DrawRect(Ink, NoticeX, Screen.Y * .62, NoticeWidth, 33.f);
            DrawWithin(Life->GetNotice(), Sand, NoticeX + 11., Screen.Y * .62 + 8., NoticeWidth - 22.);
        }
    }
    if (Car)
    {
        DrawRect(Ink, Margin, 159.f, CardWidth, 30.f);
        DrawWithin(FString::Printf(TEXT("%s   %d km/h"), ASwipeUpCityLife::CarName(Car->GetVehicleType()),
            FMath::RoundToInt(Car->GetSpeedKmh())), White, Margin + 10., 167., CardWidth - 20.);
    }
    else if (Controller && !bNearCar && !bPaused)
    {
        const FString Locked = Controller->NearbyLockedCar();
        if (!Locked.IsEmpty())
        {
            DrawRect(Ink, Margin, 159.f, CardWidth, 30.f);
            DrawWithin(Locked + TEXT(" • Garajda satın al"), Sand, Margin + 10., 167., CardWidth - 20.);
        }
    }
    const bool bDance = Life && Life->IsDancing();
    if (!bPaused && (bDance || !Choices.IsEmpty()))
    {
        const FBox2D Button = SwipeUpCityLifeLayout::InteractButton(Screen);
        DrawArea(Button, FLinearColor(.13f, .37f, .36f, .95f));
        const FString Label = bDance ? (bTouch ? TEXT("RİTİM") : TEXT("F   Ritim")) :
            (bTouch ? TEXT("ETKİLEŞ") : TEXT("F   Etkileş"));
        DrawWithin(Label, White, Button.Min.X + 8., Button.Min.Y + (Button.GetSize().Y - 15.) * .5,
            Button.GetSize().X - 16.);
    }
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
