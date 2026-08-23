<?php
namespace App\Http\Controllers;
use App\Models\Room;
use Illuminate\Http\Request;

class RoomController extends Controller {

    public function index() {
        return response()->json(Room::orderBy('room_name')->get());
    }

    public function store(Request $request) {
        $data = $request->validate([
            'room_name' => 'required|string',
            'building'  => 'nullable|string',
            'capacity'  => 'nullable|integer',
        ]);
        return response()->json(Room::create($data), 201);
    }

    public function update(Request $request, $id) {
        $room = Room::findOrFail($id);
        $room->update($request->only(['room_name', 'building', 'capacity']));
        return response()->json($room);
    }

    public function destroy($id) {
        Room::findOrFail($id)->delete();
        return response()->json(['message' => 'Deleted']);
    }
}
