import { createApiClient } from "./index";

// Compile-only regression checks. Never invoked or included by the package entry.
function contractChecks() {
  const client = createApiClient({ platform: "native", baseUrl: "https://example.test", audience: "staff", auth: { audience: "staff" } });
  // @ts-expect-error A backend path must exist.
  void client.GET("/not-a-real-route");
  // @ts-expect-error The questionnaire path parameter is mandatory.
  void client.PUT("/visit-questionnaires/{visit_type}", { body: { questions: [] } });
  // @ts-expect-error Enum values come from the backend schema.
  void client.PUT("/visit-questionnaires/{visit_type}", { params: { path: { visit_type: "invented" } }, body: { questions: [] } });
  // @ts-expect-error The backend requires a questions array.
  void client.PUT("/visit-questionnaires/{visit_type}", { params: { path: { visit_type: "primary" } }, body: {} });
  // @ts-expect-error Owner credentials cannot configure a staff instance.
  createApiClient({ platform: "native", baseUrl: "https://example.test", audience: "staff", auth: { audience: "owner" } });
}
void contractChecks;
