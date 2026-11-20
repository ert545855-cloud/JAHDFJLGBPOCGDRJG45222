#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SwipeUpCityLifeRules.h"
#include "SwipeUpCityLife.generated.h"

class ATextRenderActor;
class UProceduralMeshComponent;

enum class ECityLifeAction : uint8
{
    BuyCafe, ToggleCafe, Restock, UpgradeCafe, Serve,
    StartBarista, StartCourier, StartTaxi, StartPhotographer, Work, EndShift,
    Dance, Yoga, Run, Car0, Car1, Car2, Car3, Car4, Car5
};

struct FCityLifeChoice
{
    ECityLifeAction Action;
    FString Label;
};

UCLASS()
class SWIPEUPCITY_API ASwipeUpCityLife : public AActor
{
    GENERATED_BODY()

public:
    ASwipeUpCityLife();
    virtual void BeginPlay() override;
    void UpdatePlayer(APawn& Pawn);
    void CancelActivity();

    const SwipeUpCityLife::Profile& GetProfile() const { return Profile; }
    SwipeUpCityLife::Place FindPlace(const APawn& Pawn) const;
    static const TCHAR* PlaceName(SwipeUpCityLife::Place Place);
    static const TCHAR* CarName(int32 Index);
    TArray<FCityLifeChoice> Choices(const APawn& Pawn) const;
    bool Select(ECityLifeAction Action, APawn& Pawn);
    bool DanceBeat(const APawn& Pawn);
    bool IsStretching() const;
    bool IsDancing() const;
    FString CurrentTask(const APawn& Pawn) const;
    const FString& GetNotice() const { return Notice; }

private:
    enum class Activity : uint8 { None, Dance, Yoga, Run };
    bool Commit(const SwipeUpCityLife::Profile& NewProfile);
    void LoadProfile();
    void UpdateCafeDecor();
    void SetNotice(FString InNotice);
    bool Report(SwipeUpCityLife::Result Result);
    bool StartActivity(Activity Kind);
    void FinishActivity(int32 Reward);
    void UpdateActivity(APawn& Pawn);

    UPROPERTY()
    TArray<TObjectPtr<ATextRenderActor>> Signs;
    UPROPERTY()
    TObjectPtr<UProceduralMeshComponent> Decor2;
    UPROPERTY()
    TObjectPtr<UProceduralMeshComponent> Decor3;

    SwipeUpCityLife::Profile Profile;
    int64 Revision = 0;
    FString Notice;
    double NoticeUntil = 0;
    double CafeOrderAt = 0;
    Activity Playing = Activity::None;
    double ActivityStart = 0;
    double LastActivity = -30;
    int32 Progress = 0;
};
