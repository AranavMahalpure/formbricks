
import { SurveyNotificationData } from "@/../../packages/types/surveys";
import { prisma } from "@formbricks/database";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api/apiHelper";
import { hasApiEnvironmentAccess, hasUserEnvironmentAccess } from "@/lib/api/apiHelper"; 

export async function GET(_: Request, { params }: { params: { environmentId: string } }) {

    const headersList = headers();
    console.log("params", params);
    const environmentId = params.environmentId;
    if (!environmentId) {
        return new Response("Missing environmentId", {
            status: 400,
          });
    }

    const hasAccess = await hasEnvironmentAccess(headersList, environmentId);
    if (!hasAccess) {
        return new Response("Not authorized", {
            status: 403,
        });
    }

    const email = await getEmailForNotification(headersList);
    if (email == undefined) {
        return new Response("No email found. If you are using x-api-key header then pass email via x-api-email header field", {
            status: 404,
        });
    }

    console.log("Start");
    const currentDate = new Date();
    const lastWeekDate = new Date();
    lastWeekDate.setDate(currentDate.getDate() - 7);

    const surveys = await prisma.survey.findMany({
        where: {
        environment: {
            id: environmentId,
        },
        },
        select: {
            id: true,
            questions: true,
            status: true,
            name: true,
        }
    });

    const rawNotificationData = await getNotificationData(surveys);
    const insights = await getSurveyInsights(rawNotificationData);
    const latestResponse = await getLatestSuveryResponses(rawNotificationData);
    console.log("End");
    await sendEmailNotification(email, rawNotificationData);
    return NextResponse.json({
        surveyData: latestResponse,
        insights: insights,
    });
}

const getNotificationData = async (surveys: any) => {

    const surveyNotificationData: SurveyNotificationData[] = [];
    const currentDate = new Date();
    const lastWeekDate = new Date();
    lastWeekDate.setDate(currentDate.getDate() - 7);

    for await (const survey of surveys) {
        const surveyId = survey.id;
        const latestResponseData = await prisma.response.findFirst({
            where: {
              survey: {
                id: surveyId,
              },
              finished: true,
              createdAt: {
                gte: lastWeekDate.toISOString(),
                lte: currentDate.toISOString(),
              }
            },
            orderBy: [
              {
                createdAt: "desc",
              },
            ],
          });
        
        const responseLenth = await prisma.response.count({
            where: {
                survey: {
                id: surveyId,
                },
                createdAt: {
                    gte: lastWeekDate.toISOString(),
                    lte: currentDate.toISOString(),
                }
            },
            orderBy: [
                {
                createdAt: "desc",
                },
            ],
        });
    
        const responseFinishedLenth = await prisma.response.count({
            where: {
                survey: {
                id: surveyId,
                },
                finished: true,
                createdAt: {
                    gte: lastWeekDate.toISOString(),
                    lte: currentDate.toISOString(),
                }
            },
            orderBy: [
                {
                createdAt: "desc",
                },
            ],
        });

        const numDisplays = await prisma.display.count({
            where: {
                surveyId,
                createdAt: {
                    gte: lastWeekDate.toISOString(),
                    lte: currentDate.toISOString(),
                }
            },
        });

        const numDisplaysResponded = await prisma.display.count({
            where: {
                surveyId,
                status: "responded",
                createdAt: {
                    gte: lastWeekDate.toISOString(),
                    lte: currentDate.toISOString(),
                }
            },
        });

        surveyNotificationData.push({
            id: surveyId,
            numDisplays: numDisplays,
            numDisplaysResponded: numDisplaysResponded,
            responseLenght: responseLenth,
            latestResponse: latestResponseData,
            responseCompletedLength: responseFinishedLenth,
            questions: survey.questions,
            status: survey.status,
            name: survey.name,
        });
    }

    return surveyNotificationData;
};

const getSurveyInsights = async (notificationDatas) => {
    let totalDisplays = 0;
    let totalResponses = 0;
    let totalCompletedResponses = 0;
    let totalResponseLength = 0
    for await (const notificationData of notificationDatas) {
        totalDisplays += notificationData.numDisplays;
        totalResponses += notificationData.numDisplaysResponded
        totalCompletedResponses += notificationData.responseCompletedLength
        totalResponseLength += notificationData.responseLenght
    }

    return {
        totalDisplays: totalDisplays,
        totalResponses: totalResponses,
        totalCompletedResponses: totalCompletedResponses,
        completionRate: (totalCompletedResponses/totalResponses) * 100,
        numLiveSurvey: (notificationDatas.filter((nd) => nd.status == "inProgress").length)
    };
};

const getLatestSuveryResponses = async (notificationDatas) => {
    const surveyResponses: any[] = [];

    for await (const notificationData of notificationDatas) {
        const responses: any[] = [];

        if (notificationData.status != "inProgress" || notificationData.latestResponse == null) {
            continue;
        } else if (notificationData.questions && notificationData.latestResponse) {
            for await (const question of notificationData.questions) {
                const title = question.headline;
                const answer = notificationData.latestResponse.data[question.id];
                responses.push({title: title, answer: answer});
            }
        }

        surveyResponses.push({
            surveyName: notificationData.name,
            responses: responses
        });
    }
    return surveyResponses;
};

const getEmailForNotification = async (headersList) => {

    if (headersList.get("x-api-key")) {
        return headersList.get("x-api-email");
    } else {
        const sessionUser = await getSessionUser();
        return sessionUser?.email;
    }
};

const sendEmailNotification = async (email, responseData) => {
    email;
    responseData;
};

const hasEnvironmentAccess = async (headersList, environmentId) => {
    if (headersList.get("x-api-key")) {
      const ownership = await hasApiEnvironmentAccess(headersList.get("x-api-key").toString(), environmentId);
      if (!ownership) {
        return false;
      }
    } else {
      const user = await getSessionUser();
      if (!user) {
        return false;
      }
      const ownership = await hasUserEnvironmentAccess(user, environmentId);
      if (!ownership) {
        return false;
      }
    }
    return true;
  };