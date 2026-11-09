<?php
namespace App\Http\Controllers;
use App\Models\Room;
use Illuminate\Http\Request;

// Defense rooms. Everyone in a school can see that school's rooms (to read
// a schedule); only the admin and instructors add, rename or remove them.
class RoomController extends Controller {

    private function forSchool($user) {
        return Room::query()->when($user->school_id, fn ($q) => $q->where(
            fn ($w) => $w->where('school_id', $user->school_id)->orWhereNull('school_id')
        ));
    }

    private function assertCanManage(Request $request): void {
        abort_unless(in_array($request->user()->role, ['admin', 'instructor']), 403, 'Only the admin and instructors can manage rooms.');
    }

    public function index(Request $request) {
        return response()->json($this->forSchool($request->user())->orderBy('room_name')->get());
    }

    public function show(Request $request, $id) {
        return response()->json($this->forSchool($request->user())->findOrFail($id));
    }

    public function store(Request $request) {
        $this->assertCanManage($request);
        $data = $request->validate([
            'room_name' => 'required|string|max:150',
            'building'  => 'nullable|string|max:150',
        ]);
        $data['school_id'] = $request->user()->school_id;
        return response()->json(Room::create($data), 201);
    }

    public function update(Request $request, $id) {
        $this->assertCanManage($request);
        $room = $this->forSchool($request->user())->findOrFail($id);
        $room->update($request->validate([
            'room_name' => 'sometimes|string|max:150',
            'building'  => 'nullable|string|max:150',
        ]));
        return response()->json($room);
    }

    public function destroy(Request $request, $id) {
        $this->assertCanManage($request);
        $this->forSchool($request->user())->findOrFail($id)->delete();
        return response()->json(['message' => 'Deleted']);
    }
}
