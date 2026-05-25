// sendNotification.js
import admin from './firebaseAdmin.js';
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
export async function sendNotificationRelateToTask(params) {
  // console.log("here ")
  // const userSetting = await prisma.userSetting.findFirst({
  //     where: {
  //         userId: params.toUserId
  //     }
  // });
  // if (userSetting === null) {
  //     await prisma.userSetting.create({
  //         data: {
  //             userId: params.toUserId,
  //         }
  //     })
  // }
  // const updateUserSetting = await prisma.userSetting.findFirst({
  //     where: {
  //         userId: params.toUserId
  //     }
  // })
  // console.log(updateUserSetting)
  // if (!updateUserSetting.featurePlanNotification) {
  //     console.log("User has not allowed  feature plan end notifications")
  //     return;
  // }
  if (params.token === null) {
    console.log("User does not have fcm token")
    return;
  }
  console.log("till here ")

  var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
    token: params.token,
    notification: {
      title: 'Task Complete Notification',
      body: `${params.body}`,
    },
    data: {  //you can send only notification or only data(or include both)
      taskId: String(params.taskId),
      type: "task"
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Successfully sent message:', response);
  } catch (error) {
    console.error('Error sending message:', error);
  }
};


export async function createNotification(params) {
  try {

    const { byStaffId, toUserId, content, type, data,taskId } = params;
    const notification = await prisma.notification.create({
      data: {
        byStaffId: byStaffId,
        toUserId: toUserId,
        content: content,
        taskId:taskId,
        type: type,
        data: data
      }
    });
    console.log("Notification created successfully:", notification);
    return notification;
  } catch (error) {
    console.log("Error creating notification:", error);
    throw error;
  }
};