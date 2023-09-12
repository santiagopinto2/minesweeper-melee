import { Component, OnInit, QueryList, ViewChildren } from '@angular/core';
import { GameComponent } from '../game/game.component';
import { SocketioService } from 'src/app/services/socketio.service';
import { ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Subscription, timer } from 'rxjs';
import { environment } from 'src/environments/environment';

@Component({
    selector: 'app-play',
    templateUrl: './play.component.html',
    styleUrls: ['./play.component.scss']
})
export class PlayComponent implements OnInit {

    gameId: string;
    socket: any;

    settingsFormControl = new FormGroup({
        numberOfBoards: new FormControl(10, [Validators.required, Validators.min(1), Validators.max(20)]),
        startingNumberOfMines: new FormControl(10, [Validators.required, Validators.min(1), Validators.max(80)])
    });
    numberOfBoards = this.settingsFormControl.get('numberOfBoards');
    startingNumberOfMines = this.settingsFormControl.get('startingNumberOfMines');

    boardCounter = [0, 0];
    numberOfMines = [this.startingNumberOfMines.value, this.startingNumberOfMines.value];
    rowSize = [10, 10];
    playerId = 1;
    playersCells = [];
    event: any;
    subscribeTimer: Subscription;
    startingTimer = 3;
    gameStarted = false;
    gameStarting = false;
    playerJoined = false;
    gameFinished = true;
    hasWon = [false, false];
    isPlayable = [true, true];
    isFirstClick = [true, true];

    @ViewChildren(GameComponent) boards: QueryList<GameComponent>;


    constructor(
        private socketIoService: SocketioService,
        private route: ActivatedRoute,
        private snackbar: MatSnackBar
    ) { }

    ngOnInit(): void {
        this.gameId = this.route.snapshot.paramMap.get('id');
        this.socketIoService.connect(this.gameId);

        this.receiveGameJoin();
        this.receiveGameStart();
        this.receiveGameUpdate();
        this.receiveNewBoard();
    }

    ngAfterViewInit() {
        this.boards.changes.subscribe((data: any) => {
            this.assignBoards();
        });
    }

    gameStart() {
        this.socketIoService.gameStart(this.gameId, { numberOfBoards: this.numberOfBoards.value, startingNumberOfMines: this.startingNumberOfMines.value });
    }

    reset() {
        if (!!this.subscribeTimer) this.subscribeTimer.unsubscribe();
        this.gameStarting = true;
        this.isPlayable[0] = this.isPlayable[1] = false;
        this.rowSize = [10, 10];
        this.boardCounter = [0, 0];
        this.numberOfMines[0] = this.numberOfMines[1] = this.startingNumberOfMines.value;
        this.gameFinished = false;
        this.hasWon[0] = this.hasWon[1] = false;
        this.isFirstClick[0] = this.isFirstClick[1] = true;


        /* let timerAudio = new Audio();
        timerAudio.src = '../../assets/sounds/race_timer.mp3';
        timerAudio.load();
        timerAudio.muted = true;
        timerAudio.muted = false;
        var resp = timerAudio.play();
        if (resp!== undefined) {
            resp.then(() => {}).catch(error => {});
        }
        else console.log('resp is undefined') */

        this.subscribeTimer = timer(0, 1000).subscribe(val => {
            this.startingTimer = 3 - val;
            if (val == 3) {
                this.subscribeTimer.unsubscribe();
                this.gameStarting = false;
                this.isPlayable[0] = this.isPlayable[1] = true;
            }
        });
    }

    gameUpdate(event, boardId) {
        if (this.playerId != boardId) return;
        event.boardId = boardId;

        if (this.isFirstClick[boardId] && event.type === 'checkCell') {
            this.event = event;
            this.socketIoService.newBoard(this.gameId, { boardId: boardId, mines: this.numberOfMines[boardId], firstClick: event.cell });
            return;
        }

        this.socketIoService.gameUpdate(this.gameId, event);
    }

    async won(event, boardId) {
        this.hasWon[boardId] = true;

        if (this.playersCells[boardId][this.boardCounter[boardId] + 1] == undefined) {
            this.isPlayable[0] = this.isPlayable[1] = false;
            this.gameFinished = true;
            return;
        }

        this.isPlayable[boardId] = false;
        await this.sleep(2000);

        Object.assign(this.boards.toArray()[boardId].board, this.boards.toArray()[boardId].newBoard(this.numberOfMines[boardId] + 1, this.playersCells[boardId][this.boardCounter[boardId] + 1]));
        this.boardCounter[boardId]++;
        this.numberOfMines[boardId]++;

        this.hasWon[boardId] = false;
        this.isFirstClick[boardId] = true;
        this.isPlayable[boardId] = true;
    }

    async lost(event, boardId) {
        this.isPlayable[boardId] = false;
        await this.sleep(1000);
        if (boardId == this.playerId) this.socketIoService.newBoard(this.gameId, { boardId: boardId, mines: this.numberOfMines[boardId] });
    }

    receiveGameJoin() {
        this.socketIoService.receiveGameJoin().subscribe((message: string) => {
            this.snackbar.open(message, '', {
                duration: 3000,
            });
            this.playerId = 0;
            this.playerJoined = true;
        });
    }

    receiveGameStart() {
        this.socketIoService.receiveGameStart().subscribe((data: any) => {
            if (!environment.production) console.log('receiveGameStart', data);
            this.gameStarted = true;

            if (this.playerId == 1) {
                this.numberOfBoards.disable();
                this.startingNumberOfMines.disable();
            }

            this.numberOfBoards.setValue(data.numberOfBoards);
            this.startingNumberOfMines.setValue(data.startingNumberOfMines);
            this.reset();
            this.playersCells = data.cells;

            if (this.boards.toArray().length != 0) this.assignBoards();
        });
    }

    receiveGameUpdate() {
        this.socketIoService.receiveGameUpdate().subscribe((data: any) => {
            if (!environment.production) console.log('receiveGameUpdate', data);
            if (data.type === 'checkCell') this.boards.toArray()[data.boardId].checkCell(data.cell, true);
            else if (data.type === 'flag') this.boards.toArray()[data.boardId].flag(data.cell, true);
        });
    }

    receiveNewBoard() {
        this.socketIoService.receiveNewBoard().subscribe((data: any) => {
            if (!environment.production) console.log('receiveNewBoard', data);
            Object.assign(this.boards.toArray()[data.boardId].board, this.boards.toArray()[data.boardId].newBoard(null, data.cells));

            if (this.playerId == data.boardId && this.isFirstClick[data.boardId]) {
                this.isFirstClick[data.boardId] = false;
                this.boards.toArray()[data.boardId].isFirstClick = false;
                if (this.event.type === 'checkCell') this.boards.toArray()[data.boardId].checkCell(this.event.cell);
                else if (this.event.type === 'flag') this.boards.toArray()[data.boardId].flag(this.event.cell);
            }
            else this.isFirstClick[data.boardId] = true;

            this.isPlayable[data.boardId] = true;
        });
    }

    assignBoards() {
        Object.assign(this.boards.toArray()[0].board, this.boards.toArray()[0].newBoard(this.numberOfMines[0], this.playersCells[0][0]));
        Object.assign(this.boards.toArray()[1].board, this.boards.toArray()[1].newBoard(this.numberOfMines[1], this.playersCells[1][0]));
    }

    settingsFormatter(setting, max) {
        if (!!setting.value) {
            setting.setValue(Math.abs(setting.value));
            if (setting.value > max) setting.setValue(max);
        }
        else setting.setValue(null);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
