/**
 * GOOGLE CALENDAR ADAPTER
 * NOTE:
 * This is intentionally stubbed.
 * Auth + API wiring comes next.
 */

export const googleCalendarAdapter = {
  async createEvent(booking: any): Promise<string> {
    // TODO: Implement Google Calendar API call
    console.log("Creating calendar event for booking", booking.id);

    // Temporary placeholder
    return `gcal_${booking.id}`;
  },

  async updateEvent(eventId: string, booking: any) {
    console.log("Updating calendar event", eventId);
  },

  async deleteEvent(eventId: string) {
    console.log("Deleting calendar event", eventId);
  },
};
