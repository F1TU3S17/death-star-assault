# Yavin mission sequence review

## Current sequence

`src/game/missions.js` now runs: Red Squadron combat → clear surface batteries → escort Gold Squadron’s three Y-wings → Red Leader assault → Wedge cover → trench run → Luke’s torpedo QTE → explosion cinematic. The new stage follows the Gold escort and precedes Wedge cover.

## Episode IV chronology to preserve

- Gold Squadron makes the first trench attack; Vader and his wingmen destroy the Y-wings before they reach the target.
- Garven “Red Leader” Dreis then makes an X-wing torpedo attack. His torpedoes hit the Death Star’s surface instead of the exhaust port, and Vader shoots him down.
- Luke, Biggs, and Wedge are held for the later run. During Luke’s trench run, damage forces Wedge out of formation; Vader then kills Biggs. Han and Chewbacca return in the Falcon, knock Vader off Luke’s tail, and give Luke the opening to fire the successful shot.

Sources: [Rebel Pilots](https://www.starwars.com/databank/rebel-pilots), [Garven Dreis](https://www.starwars.com/databank/garven-dreis), [Wedge Antilles](https://www.starwars.com/databank/wedge-antilles), [Biggs Darklighter](https://www.starwars.com/databank/biggs-darklighter/), [Luke Skywalker](https://www.starwars.com/databank/luke-skywalker/), [Han Solo](https://www.starwars.com/databank/Han-Solo).

## Implemented playable stage: Red Leader’s attack

Implemented one configurable `assault` stage immediately before `wedge-cover`. The player protects Red Leader’s X-wing, holds off three TIE fighters, and reaches the torpedo-run vantage point. Completion is driven by reaching that position after clearing the attackers. Red Leader then fires and misses as a short authored combat outcome; the game should not skip the attempt with a timer or let player success change the canonical miss. Transition into the existing Wedge-cover stage with Red Leader lost and Wedge damaged during the continuing final run.

The escort rewards keeping Gold Y-wings alive up to its navigation objective. Their subsequent canonical destruction in the first trench attempt is not currently shown. Wedge cover is a separate playable opening to the final run; Biggs’s loss and Han’s rescue remain future scene additions. These gaps are distinct from the newly implemented Red Leader miss and loss.



## Implemented scope and remaining adaptation

The campaign now has eight stages. The inserted stage uses actual TIE kills, Red Leader’s physical ally health and a physical rally radius, followed by visible missed torpedoes and the loss of Red Leader. It has no timer-based completion. Subsequent radio coordination uses Yavin Control rather than the fallen Red Leader. Wedge’s withdrawal is still a separate gameplay stage before the final trench segment; this compresses the film chronology. Gold escort survival remains a gameplay outcome, not a claim that its first trench attack canonically succeeded. This update does not add new Biggs/Falcon scenes.
