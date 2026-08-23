<?php
namespace App\Http\Controllers;
use App\Models\Notification;
use Illuminate\Http\Request;

class NotificationController extends Controller {

    public function index(Request $request) {
        $user          = $request->user();
        $notifications = Notification::where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->get();

        $unreadCount = $notifications->where('is_read', false)->count();

        return response()->json([
            'notifications' => $notifications,
            'unread_count'  => $unreadCount,
        ]);
    }

    public function markRead(Request $request, $id) {
        $notification = Notification::where('id', $id)
            ->where('user_id', $request->user()->id) // scope to owner
            ->firstOrFail();

        $notification->update(['is_read' => true]);
        return response()->json(['message' => 'Marked as read']);
    }

    public function markAllRead(Request $request) {
        Notification::where('user_id', $request->user()->id)
            ->where('is_read', false)
            ->update(['is_read' => true]);

        return response()->json(['message' => 'All notifications marked as read']);
    }
}
