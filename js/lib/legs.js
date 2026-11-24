// Abschnitte einer Verbindung: Was ist eine Fahrt, was nur Fußweg/eigenes Fahrzeug?
// Eine Stelle für alle (vorher fünfmal leicht unterschiedlich nachgebaut).
export const OWN_WAY = new Set(["WALK", "BIKE", "CAR", "RENTAL", "CAR_PARKING"]);

export const isWalk = (leg) => leg.mode === "WALK";
/** Fahrt mit einem Verkehrsmittel (auch Rufbus), kein Fußweg/Rad/Auto. */
export const isRide = (leg) => !OWN_WAY.has(leg.mode);
export const rideLegs = (it) => it.legs.filter(isRide);
