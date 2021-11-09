import FTPConnection from "./FTPConnection";
import FTPProfile from "./FTPProfile";
import { app } from "./../ui/index";
import FolderEntry from "../folder/FolderEntry";
import { unselectAll } from "../selection/selection";
import WebsocketFTPConnection from "../../web/WebsocketFTPConnection";
import { addMessage } from "../ui/messages";

/**
 * An FTP session that holds some information about the current session.
 * <p>
 * The FTP connection is separated from the session so that the session can
 * reconnect using a new connection if required.
 * <p>
 * The session also holds the directory cache and keeps track of what directory
 * the user is currently in. When changing the directory using the session, the
 * directory might not change on remote ftp server until required. This is to
 * ensure that folders can be navigated using cache without requireing any ftp
 * command to be sent, allowing instant folder traversing.
 */
export default class FTPSession {
    public readonly profile: FTPProfile;
    private connection: FTPConnection;
    public workdir = "/";
    public sendWorkDir = "/";
    public cache: {[key: string]: FolderEntry[]} = {};

    constructor(profile: FTPProfile) {
        this.profile = profile;
    }

    workdirUpdate() {
        unselectAll();
        app.forceUpdate();
    }

    cd(path: string) {
        if (!this.workdir.endsWith("/")) this.workdir += "/";
        if (path.startsWith("/")) {
            this.workdir = path;
        } else {
            this.workdir += path;
            console.log("Moving to " + path);
        }
        this.workdirUpdate();
    }

    cdup() {
        const parts = this.workdir.split("/");
        parts.pop();
        this.workdir = parts.join("/");
        if (this.workdir == "") this.workdir = "/";
        console.log("Moving up");

        this.workdirUpdate();
    }

    async refresh() {
        // Delete cache
        delete this.cache[this.workdir];
        // Refetch the entries and trigger a rerender after that (getEntries sets the state when done)
        app.folderContent.getEntries();
        
        unselectAll();
    }

    clearCache() {
        this.cache = {};
    }

    /**
     * Get the ftp connection with the intention of doing stuff, so the workdir
     * needs to be up to date.
     */
    async getConnection(): Promise<FTPConnection> {
        if (this.connection instanceof WebsocketFTPConnection) {
            const websocketFTPConnection = this.connection as WebsocketFTPConnection;
            if (websocketFTPConnection.websocket.readyState != WebSocket.OPEN) {
                // The connection is a websocket and the websocket has closed.
                console.log("Reconnecting websocket");
                addMessage({
                    color: "info",
                    message: "Reconnecting...",
                    stayForMillis: 2000
                });
                // Reconnect the websocket
                await websocketFTPConnection.connectToWebsocket();
                console.log("Websocket reconnected");
                // Check if the ftp is connected.
                const isConnected = await websocketFTPConnection.isConnected();
                if (!isConnected) {
                    console.log("Reconnecting to ftp.");
                    // Reconnect
                    const { host, port, username, password, secure } = this.profile;
                    await websocketFTPConnection.connect(host, port, username, password, secure);
                    console.log("Reconnected to ftp.");
                    addMessage({
                        color: "success",
                        message: "Reconnected!",
                        stayForMillis: 2000
                    });
                }
            }
        }
        if (this.workdir != this.sendWorkDir) {
            if (!app.tasks.requestNewTask()) {
                throw new Error("Unable to change the directory right now, a task is running.");
            }
            console.log("Updateing remote workdir");
            await this.connection.cd(this.workdir);
            this.sendWorkDir = this.workdir;
            return this.connection;
        }
        return this.connection;
    }

    setConnection(connection: FTPConnection) {
        this.connection = connection;
    }
}