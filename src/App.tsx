import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/contexts/AuthContext";
import { startVersionCheck } from "@/lib/versionCheck";
import AppLayout from "@/components/layout/AppLayout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import VacanciesIndex from "./pages/VacanciesIndex";
import VacancyDetail from "./pages/VacancyDetail";
import CandidatesList from "./pages/CandidatesList";
import PostulantDetail from "./pages/PostulantDetail";
import UserManagement from "./pages/UserManagement";
import RubricasList from "./pages/RubricasList";
import RubricaDetail from "./pages/RubricaDetail";
import NotFound from "./pages/NotFound";

// Lazy: solo se descarga el bundle cuando el user entra a /archivados
const Archivados = lazy(() => import("./pages/Archivados"));
const Informes = lazy(() => import("./pages/Informes"));
const Facturacion = lazy(() => import("./pages/Facturacion"));
const ArmarVacante = lazy(() => import("./pages/ArmarVacante"));
const JdSessionsIndex = lazy(() => import("./pages/JdSessionsIndex"));
const JdSessionDetail = lazy(() => import("./pages/JdSessionDetail"));
const HuntingRequestsIndex = lazy(() => import("./pages/HuntingRequestsIndex"));
const HuntingInbox = lazy(() => import("./pages/HuntingInbox"));
const MisInformes = lazy(() => import("./pages/MisInformes"));
const AdminOrganizations = lazy(() => import("./pages/AdminOrganizations"));
const AdminOrgNew = lazy(() => import("./pages/AdminOrgNew"));
const AdminOrgDetail = lazy(() => import("./pages/AdminOrgDetail"));
const MiOrganizacion = lazy(() => import("./pages/MiOrganizacion"));
const Support = lazy(() => import("./pages/Support"));
const SupportTicketDetail = lazy(() => import("./pages/SupportTicketDetail"));

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    startVersionCheck();
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/vacantes" element={<VacanciesIndex />} />
              <Route path="/vacantes/:vacancy_id" element={<VacancyDetail />} />
              <Route path="/candidatos" element={<CandidatesList />} />
              <Route path="/postulantes/:id_postulant" element={<PostulantDetail />} />
              <Route path="/rubricas" element={<RubricasList />} />
              <Route path="/rubricas/:vacancy_id" element={<RubricaDetail />} />
              <Route path="/usuarios" element={<UserManagement />} />
              <Route
                path="/archivados"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <Archivados />
                  </Suspense>
                }
              />
              <Route
                path="/informes"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <Informes />
                  </Suspense>
                }
              />
              <Route
                path="/facturacion"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <Facturacion />
                  </Suspense>
                }
              />
              <Route
                path="/armar-vacante"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <ArmarVacante />
                  </Suspense>
                }
              />
              <Route
                path="/jd-sessions"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <JdSessionsIndex />
                  </Suspense>
                }
              />
              <Route
                path="/jd-sessions/:id"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <JdSessionDetail />
                  </Suspense>
                }
              />
              <Route
                path="/headhunting"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <HuntingRequestsIndex />
                  </Suspense>
                }
              />
              <Route
                path="/hunting/inbox"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <HuntingInbox />
                  </Suspense>
                }
              />
              <Route
                path="/mis-informes"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <MisInformes />
                  </Suspense>
                }
              />
              <Route
                path="/admin/orgs"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <AdminOrganizations />
                  </Suspense>
                }
              />
              <Route
                path="/admin/orgs/new"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <AdminOrgNew />
                  </Suspense>
                }
              />
              <Route
                path="/admin/orgs/:id"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <AdminOrgDetail />
                  </Suspense>
                }
              />
              <Route
                path="/mi-organizacion"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <MiOrganizacion />
                  </Suspense>
                }
              />
              <Route
                path="/soporte"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <Support />
                  </Suspense>
                }
              />
              <Route
                path="/soporte/:id"
                element={
                  <Suspense fallback={<div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
                    <SupportTicketDetail />
                  </Suspense>
                }
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
