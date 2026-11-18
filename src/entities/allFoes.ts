// Every foe's own file in entities/foes/, loaded for what each registers (entities/foeKit.ts): imported for its
// effect by whatever builds or runs a foe (models/index.ts, enemyAI.ts), so a new foe's file needs no import of its own.
import.meta.glob('./foes/*.ts', { eager: true });
