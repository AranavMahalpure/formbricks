import { AppConfig } from "@formbricks/lib/js/config";
import { NetworkError, Result, err, okVoid } from "@formbricks/lib/js/errors";
import { Logger } from "@formbricks/lib/js/logger";
import { deinitalize, initialize } from "./initialize";
import { closeSurvey } from "./widget";

const appConfig = AppConfig.getInstance();
const logger = Logger.getInstance();

export const logoutPerson = async (): Promise<void> => {
  deinitalize();
  appConfig.resetConfig();
};

export const resetPerson = async (): Promise<Result<void, NetworkError>> => {
  logger.debug("Resetting state & getting new state from backend");
  closeSurvey();
  const syncParams = {
    environmentId: appConfig.get().environmentId,
    apiHost: appConfig.get().apiHost,
    userId: appConfig.get().userId,
    attributes: appConfig.get().state.attributes,
  };
  await logoutPerson();
  try {
    await initialize(syncParams);
    return okVoid();
  } catch (e) {
    return err(e as NetworkError);
  }
};
