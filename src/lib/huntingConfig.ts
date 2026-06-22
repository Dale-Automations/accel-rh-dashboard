// Límite diario seguro de perfiles visitados por el scraper (lo que puede romper LinkedIn).
// Etapa 1: todo corre por la cuenta de Vicky (un solo scraper). El desglose por cuenta llega en Etapa 2.
// Conservador para arrancar; se puede subir si todo va bien.
export const DAILY_PROFILE_CAP = 80;

// Tamaño de cada tanda de scraping (numberOfAddsPerLaunch en el Profile Scraper).
export const SCRAPE_BATCH = 50;
