#include "../Source/SwipeUpCity/SwipeUpCityLifeRules.h"

#include <cassert>
#include <iostream>

using namespace SwipeUpCityLife;

void CompleteShift(Profile& Player, Job Role)
{
    const Shift& Shift = GetShift(Role);
    const int StartingCash = Player.Cash;
    assert(Player.TakeShift(Role, Shift.Employer) == Result::Ok);
    assert(Player.TakeShift(Role, Shift.Employer) == Result::Busy);

    for (int Index = 0; Index < Shift.Length; ++Index)
    {
        const Step Step = Shift.Steps[Index];
        int Paid = 0;
        assert(Player.Work(Place::None, Step.bInCar, Paid) == Result::WrongPlace && Paid == 0);
        assert(Player.Work(Step.Site, !Step.bInCar, Paid) ==
            (Step.bInCar ? Result::NeedCar : Result::NeedFoot));
        assert(Player.Work(Step.Site, Step.bInCar, Paid) == Result::Ok);
        assert(Paid == (Index == Shift.Length - 1 ? Shift.Pay : 0));
    }
    assert(Player.Cash == StartingCash + Shift.Pay);
    assert(Player.Active == Job::None && Player.Stage == 0);
    int Paid = 0;
    assert(Player.Work(Shift.Steps[Shift.Length - 1].Site, false, Paid) == Result::Locked && Paid == 0);
}

int main()
{
    Profile Player;
    assert(Player.Cash == 280 && Player.OwnsCar(0) && Player.OwnsCar(1));
    assert(!Player.OwnsCar(-1) && !Player.OwnsCar(6));
    assert(Player.BuyCar(-1) == Result::Locked);
    assert(Player.BuyCar(2) == Result::TooPoor);
    assert(Player.BuyCafe() == Result::TooPoor);
    assert(Player.Refill() == Result::Locked);
    assert(Player.TakeShift(Job::Barista, Place::Taxi) == Result::WrongPlace);

    for (int I = 0; I < 3; ++I) CompleteShift(Player, Job::Courier);
    assert(Player.Cash == 850);
    assert(Player.BuyCafe() == Result::Ok && Player.Cash == 0);
    assert(Player.BuyCafe() == Result::Full);
    assert(Player.Serve() == Result::Closed);
    assert(Player.ToggleCafe() == Result::Ok);
    for (int I = 0; I < 4; ++I) assert(Player.Serve() == Result::Ok);
    assert(Player.Cash == 224 && Player.CafeOrders == 4 && !Player.bCafeOpen);
    assert(Player.ToggleCafe() == Result::Empty);
    assert(Player.Refill() == Result::Ok && Player.Supplies == 5 && Player.Cash == 149);

    CompleteShift(Player, Job::Barista);
    CompleteShift(Player, Job::Taxi);
    CompleteShift(Player, Job::Photographer);
    assert(Player.UpgradeCafe() == Result::Ok && Player.CafeLevel == 2);
    assert(Player.Capacity() == 18 && Player.UpgradeCafe() == Result::TooPoor);
    Player.Cash = 2500;
    Player.Supplies = 17;
    assert(Player.Refill() == Result::Ok && Player.Cash == 2485 && Player.Supplies == 18);
    assert(Player.Refill() == Result::Full);
    assert(Player.UpgradeCafe() == Result::Ok && Player.CafeLevel == 3);
    assert(Player.BuyCar(3) == Result::Ok && Player.OwnsCar(3));
    const int AfterPurchase = Player.Cash;
    assert(Player.BuyCar(3) == Result::Full && Player.Cash == AfterPurchase);
    assert(Player.ToggleCafe() == Result::Ok);

    assert(Player.TakeShift(Job::Taxi, Place::Taxi) == Result::Ok);
    int Paid = 0;
    assert(Player.Work(Place::Taxi, true, Paid) == Result::Ok && Paid == 0);
    Player.CompleteActivity(65);
    const auto Saved = Player.Write();
    Profile Loaded;
    assert(Profile::Read(Saved, Loaded) && Loaded.Write() == Saved);
    assert(Loaded.Stage == 1 && Loaded.Active == Job::Taxi && Loaded.bCafeOpen);
    assert(Loaded.Work(Place::Park, true, Paid) == Result::Ok && Paid == 0);
    assert(Loaded.Work(Place::Courier, true, Paid) == Result::Ok && Paid == 265);

    auto Malformed = Saved;
    Malformed[0] = 2;
    const auto Before = Loaded.Write();
    assert(!Profile::Read(Malformed, Loaded) && Loaded.Write() == Before);
    Malformed = Saved;
    Malformed[1] = -9;
    Malformed[2] = 0;
    Malformed[3] = 1000;
    Malformed[4] = -1;
    Malformed[8] = 1000;
    Malformed[10] = 1;
    assert(Profile::Read(Malformed, Loaded));
    assert(Loaded.Cash == 0 && Loaded.Supplies == 0 && !Loaded.bCafeOpen);
    assert(Loaded.CarKeys == 3 && Loaded.Active == Job::None);

    std::cout << "City life rules: four jobs, cafe funding and daily stock, upgrades, car keys, rewards and save round trip passed.\n";
}
