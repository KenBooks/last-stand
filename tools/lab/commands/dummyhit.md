# `lab dummyhit`

Strike the village's middle training dummy from four sides. The damage meter must register each attack,
and the movement of the dummy's head must agree with the impact's direction. The dummy must settle
upright after each hit. A single swing or arrow must also rebound across the starting position.

- `npm run lab -- dummyhit --class warrior` uses Rending Cleave.
- `npm run lab -- dummyhit --class ranger` uses Nockshot and moves the archer after release.
- `npm run lab -- dummyhit --class mage` uses Starfall, with its first impact offset from the caster,
  and checks that the dummy's spring still moves when Glacial Nova freezes it.
- `--canary` forces the same impact direction on all four sides. Three directions must fail the check.
- `--pictures` captures the opposing side hits from directly overhead.
