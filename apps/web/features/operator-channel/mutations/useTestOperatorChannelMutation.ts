import { apiClient } from "../../../state/api";
import { makeInvalidatingMutation } from "../../../state/makeInvalidatingMutation";
import { getOperatorChannelStatusQueryKey } from "../queries/useOperatorChannelStatusQuery";

/** Send a test message to the operator DM (`POST /test`); refreshes the status. */
export const useTestOperatorChannelMutation = makeInvalidatingMutation(
  apiClient.operatorChannel.testOperatorChannel.useMutation,
  getOperatorChannelStatusQueryKey,
);
