import { Electroview } from "electrobun/view";
import type { WebviewRPCSchema } from "../shared/types";

const rpc = Electroview.defineRPC<WebviewRPCSchema>({
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

export const electrobun = new Electroview({ rpc });
