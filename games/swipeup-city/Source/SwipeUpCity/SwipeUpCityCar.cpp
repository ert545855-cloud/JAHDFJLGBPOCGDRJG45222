#include "SwipeUpCityCar.h"
#include "SwipeUpCityCharacter.h"
#include "SwipeUpCityMesh.h"
#include "SwipeUpCityLifeRules.h"
#include "GameFramework/Controller.h"
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

void ASwipeUpCityCar::SetVehicleType(int32 Type)
{
    VehicleType = FMath::Clamp(Type, 0, static_cast<int32>(SwipeUpCityLife::Vehicles.size()) - 1);
    const auto& Spec = SwipeUpCityLife::Vehicles[VehicleType];
    Chassis->SetBoxExtent(FVector(Spec.HalfLength, Spec.HalfWidth, Spec.BodyHeight - 13.f));
}

void ASwipeUpCityCar::BeginPlay()
{
    Super::BeginPlay();
    Parking = GetActorTransform();
    if (GetNetMode() == NM_DedicatedServer) return;

    const auto& Spec = SwipeUpCityLife::Vehicles[VehicleType];
    const FString Asset = FString::Printf(TEXT("CarBody%d"), VehicleType);
    SwipeUpCityMesh::Add(*this, *Chassis, *Asset);
    for (int32 Axle : {-1, 1})
    {
        for (int32 Side : {-1, 1})
        {
            USceneComponent* Hub = NewObject<USceneComponent>(this);
            Hub->SetupAttachment(Chassis);
            Hub->SetRelativeLocation(FVector(Axle * Spec.Axle, Side * Spec.WheelSide,
                Spec.WheelRadius - Spec.BodyHeight));
            AddInstanceComponent(Hub);
            Hub->RegisterComponent();
            WheelHubs.Add(Hub);
            UProceduralMeshComponent* Wheel = SwipeUpCityMesh::Add(*this, *Hub, TEXT("Wheel"));
            if (Wheel) Wheel->SetRelativeScale3D(FVector(Spec.WheelRadius / 34.f, 1.f, Spec.WheelRadius / 34.f));
            Wheels.Add(Wheel);
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
    if (!GetController() || GetController()->IsMoveInputIgnored()) return;

    const auto& Spec = SwipeUpCityLife::Vehicles[VehicleType];
    const bool bCoasting = FMath::IsNearlyZero(Throttle, .075f);
    const float Target = bBraking || bCoasting ? 0.f : Throttle * (Throttle < 0 ? 590.f : Spec.TopSpeed);
    const float Acceleration = bBraking ? 2700.f : bCoasting ? 380.f : Spec.Acceleration;
    Speed = FMath::FInterpConstantTo(Speed, Target, DeltaTime, Acceleration);

    const float Turn = Steering * FMath::Clamp(Speed / 510.f, -1.f, 1.f) * Spec.TurnRate * DeltaTime;
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
    WheelRoll = FMath::Fmod(WheelRoll + FMath::RadiansToDegrees(Speed * DeltaTime / Spec.WheelRadius), 360.f);
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
