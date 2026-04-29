import { Electroview } from "electrobun/view";
import type { AppRPCSchema } from "../shared/types";

const rpc = Electroview.defineRPC<AppRPCSchema>({
  handlers: {
    requests: {},
    messages: {
      pipelineUpdate: ({ type, payload }) => {
        window.dispatchEvent(
          new CustomEvent("pipeline-update", { detail: { type, payload } })
        );
      },
    },
  },
});

const view = new Electroview({ rpc });
export const electrobun = { rpc: view.rpc! };
