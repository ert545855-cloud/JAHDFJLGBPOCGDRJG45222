#include "SwipeUpCityCar.h"
#include "SwipeUpCityCharacter.h"
#include "SwipeUpCityMesh.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Components/InputComponent.h"
#include "Engine/World.h"
#include "GameFramework/SpringArmComponent.h"
#include "ProceduralMeshComponent.h"

ASwipeUpCityCar::ASwipeUpCityCar()
{
    PrimaryActorTick.bCanEverTick = true;
    Chassis = CreateDefaultSubobject<UBoxComponent>(TEXT("Chassis"));
    Chassis->InitBoxExtent(FVector(211, 95, 55));
    Chassis->SetCollisionProfileName(TEXT("Pawn"));
    SetRootComponent(Chassis);

    Arm = CreateDefaultSubobject<USpringArmComponent>(TEXT("ChaseArm"));
    Arm->SetupAttachment(Chassis);
    Arm->TargetArmLength = 540.f;
    Arm->SetRelativeLocation(FVector(0, 0, 121));
    Arm->SetRelativeRotation(FRotator(-11, 0, 0));
    Arm->bEnableCameraRotationLag = true;
    Arm->CameraRotationLagSpeed = 9.f;

    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("ChaseCamera"));
    Camera->SetupAttachment(Arm, USpringArmComponent::SocketName);
}

void ASwipeUpCityCar::BeginPlay()
{
    Super::BeginPlay();
    Parking = GetActorTransform();
    if (GetNetMode() == NM_DedicatedServer) return;

    const FString Asset = FString::Printf(TEXT("CarBody%d"), PaintStyle);
    SwipeUpCityMesh::Add(*this, *Chassis, *Asset);
    for (int32 Axle : {-1, 1})
    {
        for (int32 Side : {-1, 1})
        {
            USceneComponent* Hub = NewObject<USceneComponent>(this);
            Hub->SetupAttachment(Chassis);
            Hub->SetRelativeLocation(FVector(Axle * 128, Side * 94, -35));
            AddInstanceComponent(Hub);
            Hub->RegisterComponent();
            WheelHubs.Add(Hub);
            Wheels.Add(SwipeUpCityMesh::Add(*this, *Hub, TEXT("Wheel")));
        }
    }
}

void ASwipeUpCityCar::SetupPlayerInputComponent(UInputComponent* Input)
{
    Super::SetupPlayerInputComponent(Input);
    Input->BindAxis("MoveForward", this, &ASwipeUpCityCar::SetThrottle);
    Input->BindAxis("MoveRight", this, &ASwipeUpCityCar::SetSteering);
    Input->BindAction("Jump", IE_Pressed, this, &ASwipeUpCityCar::StartBrake);
    Input->BindAction("Jump", IE_Released, this, &ASwipeUpCityCar::StopBrake);
}

void ASwipeUpCityCar::SetThrottle(float Value)
{
    Throttle = FMath::Clamp(Value, -1.f, 1.f);
}

void ASwipeUpCityCar::SetSteering(float Value)
{
    Steering = FMath::Clamp(Value, -1.f, 1.f);
}

void ASwipeUpCityCar::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    if (!GetController()) return;

    const bool bCoasting = FMath::IsNearlyZero(Throttle, .075f);
    const float Target = bBraking || bCoasting ? 0.f : Throttle * (Throttle < 0 ? 590.f : 1800.f);
    const float Acceleration = bBraking ? 2700.f : bCoasting ? 380.f : 820.f;
    Speed = FMath::FInterpConstantTo(Speed, Target, DeltaTime, Acceleration);

    const float Turn = Steering * FMath::Clamp(Speed / 510.f, -1.f, 1.f) * 93.f * DeltaTime;
    if (!FMath::IsNearlyZero(Turn))
    {
        const FRotator Heading = GetActorRotation() + FRotator(0, Turn, 0);
        FCollisionQueryParams Query;
        Query.AddIgnoredActor(this);
        if (Driver) Query.AddIgnoredActor(Driver);
        if (!GetWorld()->OverlapBlockingTestByChannel(GetActorLocation(), Heading.Quaternion(),
            ECC_Pawn, FCollisionShape::MakeBox(Chassis->GetScaledBoxExtent()), Query))
            SetActorRotation(Heading);
    }

    FHitResult Impact;
    AddActorWorldOffset(GetActorForwardVector() * Speed * DeltaTime, true, &Impact);
    if (Impact.bBlockingHit) Speed = 0.f;
    WheelRoll = FMath::Fmod(WheelRoll + FMath::RadiansToDegrees(Speed * DeltaTime / 34.f), 360.f);
    for (int32 Index = 0; Index < WheelHubs.Num(); ++Index)
    {
        if (Index >= 2) WheelHubs[Index]->SetRelativeRotation(FRotator(0, Steering * 24.f, 0));
        if (Wheels[Index]) Wheels[Index]->SetRelativeRotation(FRotator(WheelRoll, 0, 0));
    }
}

void ASwipeUpCityCar::Halt()
{
    Speed = Throttle = Steering = 0.f;
    bBraking = false;
}

void ASwipeUpCityCar::ResetToParking()
{
    Halt();
    SetActorTransform(Parking, false, nullptr, ETeleportType::TeleportPhysics);
}
