import { dbInterna } from "@/lib/db/interno";
import { anime } from "@/lib/db/schema";

export async function todosLosAnimes() {
  return dbInterna().select().from(anime);
}
