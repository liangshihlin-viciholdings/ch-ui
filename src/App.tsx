import {
  RouterProvider,
  createRouter,
  createHashHistory,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

// In the packaged desktop build the renderer is served over file://, where the
// pathname is the on-disk path to index.html and matches no route (-> "Not
// Found"). Hash history keeps routing in the URL fragment, which works under
// file://. The web build keeps default browser history.
const isFileProtocol = window.location.protocol === "file:";

const router = createRouter({
  routeTree,
  basepath: isFileProtocol ? "/" : import.meta.env.BASE_URL,
  history: isFileProtocol ? createHashHistory() : undefined,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
