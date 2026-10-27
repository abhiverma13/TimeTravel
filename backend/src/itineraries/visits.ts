import { Types } from 'mongoose';

import { GroupModel } from '../groups/groupModel';
import { ItineraryModel } from './itineraryModel';

/** Whether the activity is a stop on `date` of a trip the traveller may see: their own, or one of their groups'. */
export async function isScheduledOn(userId: string, activityId: Types.ObjectId, date: string): Promise<boolean> {
  const traveller = new Types.ObjectId(userId);
  const groups = await GroupModel.find({ 'members.userId': traveller }, { _id: 1 });
  const trips = await ItineraryModel.countDocuments({
    $or: [{ userId: traveller, groupId: null }, { groupId: { $in: groups.map((group) => group._id) } }],
    days: { $elemMatch: { date, 'stops.activityId': activityId } },
  });
  return trips > 0;
}
