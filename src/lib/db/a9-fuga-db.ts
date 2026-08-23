import { dbInterna } from "@/lib/db/interno";
import { anime } from "@/lib/db/schema";

export async function todosLosAnimesDb() {
  return dbInterna().select().from(anime);
}
